<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Module_package — .wmod signed module package intake, inspection and verification.
 *
 * Ports three Node services into one dependency-free PHP library:
 *
 *   apps/api/src/moduleCenter/archive.service.ts      -> inspect()
 *   packages/shared/src/moduleCenter.ts               -> validate_manifest()
 *   apps/api/src/moduleCenter/verification.service.ts -> verify()
 *
 * Why there is no ZipArchive / yauzl here: the cPanel target cannot install
 * extensions, and a hosted account may not have ext-zip compiled in. This reads
 * the ZIP central directory directly and inflates entries with gzinflate()
 * (ext-zlib is part of every PHP build), so the Module Center works on any
 * cPanel host without touching the server configuration.
 *
 * Verification fails closed, exactly like the Node service: a check with
 * severity "critical" that is not PASSED makes the whole report fail. That
 * means a package cannot be verified without a trusted publisher signature AND
 * a configured malware scanner. That is intentional, not a bug.
 */
class Module_package {

  /** Node archive.service.ts limits, kept identical. */
  const MAX_ENTRIES      = 5000;
  const MAX_UNCOMPRESSED = 209715200; // 200 MB
  const MAX_ENTRY        = 26214400;  // 25 MB
  const MAX_MANIFEST     = 262144;    // 256 KB
  const MAX_SCAN_TEXT    = 12582912;  // 12 MB

  const SIGNING_PREFIX = 'windels-module:';

  public $last_error = NULL;

  // ---------------------------------------------------------------------------
  // Intake limits, read from .env so an operator can tune them without code.
  // ---------------------------------------------------------------------------

  private function env_int($key, $default) {
    $raw = getenv($key);
    if ($raw === FALSE || $raw === '') return $default;
    $value = (int) $raw;
    return $value > 0 ? $value : $default;
  }

  // ---------------------------------------------------------------------------
  // ZIP reading
  // ---------------------------------------------------------------------------

  /**
   * Inspect a .wmod archive. Returns an inspection array and throws
   * Module_package_error for anything that makes the package untrustworthy.
   */
  public function inspect($path) {
    $this->last_error = NULL;
    if (!is_file($path)) throw new Module_package_error('Package artifact is missing on disk');
    $size = @filesize($path);
    if ($size === FALSE || $size < 22) throw new Module_package_error('Package is not a readable ZIP archive');

    $entries = $this->central_directory($path, $size);
    $max_entries = $this->env_int('VP_MODULE_MAX_ENTRIES', self::MAX_ENTRIES);
    $max_uncompressed = $this->env_int('VP_MODULE_MAX_UNCOMPRESSED', self::MAX_UNCOMPRESSED);
    $max_entry = $this->env_int('VP_MODULE_MAX_ENTRY', self::MAX_ENTRY);
    $max_manifest = $this->env_int('VP_MODULE_MAX_MANIFEST', self::MAX_MANIFEST);
    $max_scan_text = $this->env_int('VP_MODULE_MAX_SCAN_TEXT', self::MAX_SCAN_TEXT);

    if (count($entries) > $max_entries) throw new Module_package_error("Package exceeds {$max_entries} entries");

    $file_count = 0;
    $uncompressed = 0;
    $compressed = 0;
    $manifest_raw = NULL;
    $text_files = array();
    $paths = array();

    foreach ($entries as $entry) {
      $name = $entry['name'];
      $directory = substr($name, -1) === '/';
      if ($this->unsafe_path($name)) throw new Module_package_error("Unsafe archive path: {$name}");
      if ($this->is_symlink($entry)) throw new Module_package_error("Symbolic links are not permitted in module packages: {$name}");
      if (!empty($entry['encrypted'])) throw new Module_package_error("Encrypted archive entries are not permitted: {$name}");
      if (!$directory) {
        $file_count++;
        if ($entry['uncompressed'] > $max_entry) throw new Module_package_error("Archive entry exceeds {$max_entry} bytes: {$name}");
        $uncompressed += $entry['uncompressed'];
        $compressed += $entry['compressed'];
        if ($uncompressed > $max_uncompressed) throw new Module_package_error("Package expands beyond {$max_uncompressed} bytes");
        // Compression-ratio bomb guard: 200:1 or worse is refused.
        if ($entry['compressed'] > 0 && $entry['uncompressed'] > $entry['compressed'] * 200) {
          throw new Module_package_error("Archive entry has an implausible compression ratio: {$name}");
        }
        $paths[$name] = TRUE;
        if ($name === 'manifest.json') {
          if ($entry['uncompressed'] > $max_manifest) throw new Module_package_error('manifest.json exceeds the size limit');
          $manifest_raw = $this->read_entry($path, $entry, $max_manifest);
        } elseif ($this->is_text_file($name)) {
          $scan_budget = $max_scan_text - $this->text_bytes($text_files);
          if ($entry['uncompressed'] <= $scan_budget) {
            $content = $this->read_entry($path, $entry, $max_scan_text);
            if ($content !== NULL) $text_files[$name] = $content;
          }
        }
      }
    }

    if ($manifest_raw === NULL) throw new Module_package_error('Package does not contain a manifest.json at the archive root');
    $decoded = json_decode($manifest_raw, TRUE);
    if (!is_array($decoded)) throw new Module_package_error('manifest.json is not valid JSON');
    $manifest = $this->validate_manifest($decoded);

    return array(
      'manifest'          => $manifest,
      'fileCount'         => $file_count,
      'compressedBytes'   => (int) $compressed,
      'uncompressedBytes' => (int) $uncompressed,
      'entries'           => $entries,
      'textFiles'         => $text_files,
    );
  }

  private function text_bytes($text_files) {
    $total = 0;
    foreach ($text_files as $content) $total += strlen($content);
    return $total;
  }

  private function is_text_file($name) {
    return (bool) preg_match('#\.(js|mjs|cjs|ts|tsx|jsx|json|php|py|rb|sh|bash|sql|yml|yaml|md|txt|env|ini|conf)$#i', $name);
  }

  private function unsafe_path($name) {
    if ($name === '' || strpos($name, "\0") !== FALSE) return TRUE;
    if ($name[0] === '/' || strpos($name, '\\') !== FALSE) return TRUE;
    if (preg_match('#^[A-Za-z]:#', $name)) return TRUE;
    foreach (explode('/', $name) as $segment) if ($segment === '..') return TRUE;
    return FALSE;
  }

  /** Symfony/Unix symlinks carry mode 0120000 in the high 16 bits of external attributes. */
  private function is_symlink($entry) {
    return (($entry['external'] >> 16) & 0xF000) === 0xA000;
  }

  /** Locate and parse the ZIP central directory. */
  private function central_directory($path, $size) {
    $handle = @fopen($path, 'rb');
    if (!$handle) throw new Module_package_error('Package could not be opened for reading');
    $window = 65557; // 22 byte EOCD + 65535 byte comment
    $read = min($size, $window);
    fseek($handle, $size - $read);
    $tail = fread($handle, $read);
    $offset = FALSE;
    for ($i = strlen($tail) - 22; $i >= 0; $i--) {
      if (substr($tail, $i, 4) === "\x50\x4b\x05\x06") {
        $comment_length = unpack('v', substr($tail, $i + 20, 2));
        if ($i + 22 + $comment_length[1] === strlen($tail)) { $offset = $i; break; }
      }
    }
    if ($offset === FALSE) { fclose($handle); throw new Module_package_error('Package ZIP structure is invalid'); }

    $fields = unpack('vcount/vcount2/VcdSize/VcdOffset', substr($tail, $offset + 8, 12));
    $count = $fields['count'];
    $cd_offset = $fields['cdOffset'];
    if ($count === 0xFFFF || $cd_offset === 0xFFFFFFFF || $fields['count2'] !== $count) {
      fclose($handle);
      throw new Module_package_error('ZIP64 module packages are not supported');
    }
    fseek($handle, $cd_offset);
    $cd = fread($handle, min($size - $cd_offset, $fields['cdSize'] + 4));
    fclose($handle);
    if ($cd === FALSE || strlen($cd) < 4) throw new Module_package_error('Package ZIP central directory is truncated');

    $entries = array();
    $pointer = 0;
    $length = strlen($cd);
    while ($pointer + 46 <= $length && substr($cd, $pointer, 4) === "\x50\x4b\x01\x02") {
      // Central directory header: signature(4) madeBy(2) needed(2) flags(2)
      // method(2) modtime(2) moddate(2) crc(4) compressed(4) uncompressed(4)
      // nameLen(2) extraLen(2) commentLen(2) disk(2) internal(2) external(4) localOffset(4)
      $head = unpack('vmadeBy/vneeded/vflags/vmethod/vmodTime/vmodDate/Vcrc/Vcompressed/Vuncompressed/vnameLen/vextraLen/vcommentLen/vdisk/vinternal/Vexternal/Voffset', substr($cd, $pointer + 4, 42));
      $name = substr($cd, $pointer + 46, $head['nameLen']);
      $entries[] = array(
        'name'         => $name,
        'compressed'   => $head['compressed'],
        'uncompressed' => $head['uncompressed'],
        'method'       => $head['method'],
        'external'     => $head['external'],
        'encrypted'    => (bool) ($head['flags'] & 0x0001),
        'localOffset'  => $head['offset'],
      );
      $pointer += 46 + $head['nameLen'] + $head['extraLen'] + $head['commentLen'];
    }
    if (!count($entries)) throw new Module_package_error('Package ZIP contains no entries');
    return $entries;
  }

  /** Read one entry's bytes, inflating deflate when needed. */
  private function read_entry($path, $entry, $max_bytes) {
    $handle = @fopen($path, 'rb');
    if (!$handle) return NULL;
    $local = $entry['localOffset'];
    if ($local < 0 || $local >= filesize($path)) { fclose($handle); return NULL; }
    fseek($handle, $local);
    $header = fread($handle, 30);
    if (strlen($header) < 30 || substr($header, 0, 4) !== "\x50\x4b\x03\x04") { fclose($handle); return NULL; }
    $parts = unpack('vnamelen/vextralen', substr($header, 26, 4));
    $start = $local + 30 + $parts['namelen'] + $parts['extralen'];
    $take = min($entry['compressed'], $max_bytes);
    fseek($handle, $start);
    $raw = fread($handle, $take);
    fclose($handle);
    if ($raw === FALSE || $raw === '') return '';
    if ($entry['method'] === 0) return $raw;
    if ($entry['method'] === 8) {
      $inflated = @gzinflate($raw);
      if ($inflated === FALSE) {
        // Some writers emit a zlib wrapper instead of raw deflate.
        $inflated = @gzuncompress($raw);
      }
      if ($inflated === FALSE) throw new Module_package_error("Archive entry could not be decompressed: {$entry['name']}");
      return $inflated;
    }
    throw new Module_package_error("Unsupported compression method for {$entry['name']}");
  }

  // ---------------------------------------------------------------------------
  // Manifest schema (packages/shared/src/moduleCenter.ts ModuleManifestSchema)
  // ---------------------------------------------------------------------------

  const RE_SEMVER     = '/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/';
  const RE_MODULE_ID  = '/^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])$/';
  const RE_ROUTE      = '#^/(?:[a-zA-Z0-9:_*.-]+/?)*$#';

  /**
   * Validate and normalise a manifest (applies schema defaults, rejects unknown
   * properties the way zod .strict() does). Throws Module_package_error with
   * every field problem joined by "; ".
   */
  public function validate_manifest($input) {
    $errors = array();
    $value = $this->walk($input, $this->manifest_spec(), '', $errors);
    if (count($errors)) throw new Module_package_error(implode('; ', $errors));
    $this->refine($value, $errors);
    if (count($errors)) throw new Module_package_error(implode('; ', $errors));
    return $value;
  }

  private function manifest_spec() {
    $dependency = array('type' => 'object', 'strict' => TRUE, 'children' => array(
      'id'       => array('type' => 'string', 'regex' => self::RE_MODULE_ID, 'message' => 'lowercase module id required'),
      'version'  => array('type' => 'string', 'min' => 1, 'max' => 80),
      'optional' => array('type' => 'bool', 'default' => FALSE),
    ));
    $route = array('type' => 'object', 'strict' => TRUE, 'children' => array(
      'method'      => array('type' => 'enum', 'values' => array('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
      'path'        => array('type' => 'route'),
      'permission'  => array('type' => 'string', 'min' => 2, 'max' => 80),
      'description' => array('type' => 'string', 'max' => 300),
    ));
    $link = array('type' => 'object', 'strict' => TRUE, 'children' => array(
      'label' => array('type' => 'string', 'min' => 1, 'max' => 80),
      'href'  => array('type' => 'https_url'),
    ));
    $section = array('type' => 'object', 'strict' => TRUE, 'children' => array(
      'type'  => array('type' => 'enum', 'values' => array('info', 'markdown', 'links')),
      'title' => array('type' => 'string', 'min' => 1, 'max' => 120),
      'body'  => array('type' => 'string', 'max' => 10000),
      'links' => array('type' => 'array', 'max' => 20, 'default' => array(), 'item' => $link),
    ));
    return array('type' => 'object', 'strict' => TRUE, 'children' => array(
      'schemaVersion'   => array('type' => 'int', 'literal' => 1),
      'id'              => array('type' => 'string', 'regex' => self::RE_MODULE_ID, 'message' => 'lowercase module id required'),
      'name'            => array('type' => 'string', 'min' => 2, 'max' => 100),
      'version'         => array('type' => 'string', 'regex' => self::RE_SEMVER, 'message' => 'strict semantic version required'),
      'platform'        => array('type' => 'string', 'literal' => 'windels-ai-os'),
      'packageType'     => array('type' => 'enum', 'values' => array('module', 'plugin', 'integration', 'approved_software')),
      'description'     => array('type' => 'string', 'min' => 10, 'max' => 3000),
      'author'          => array('type' => 'string', 'min' => 2, 'max' => 120),
      'vendor'          => array('type' => 'string', 'min' => 2, 'max' => 120),
      'license'         => array('type' => 'string', 'min' => 1, 'max' => 80),
      'minimumVersion'  => array('type' => 'string', 'regex' => self::RE_SEMVER, 'message' => 'strict semantic version required'),
      'maximumVersion'  => array('type' => 'string', 'regex' => self::RE_SEMVER, 'message' => 'strict semantic version required'),
      'apiVersion'      => array('type' => 'string', 'literal' => 'v1'),
      'dependencies'    => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => $dependency),
      'permissions'     => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'string', 'min' => 2, 'max' => 80)),
      'accessRoles'     => array('type' => 'array', 'min' => 1, 'default' => array('super_admin'), 'item' => array('type' => 'enum', 'values' => array('user', 'admin', 'super_admin'))),
      'capabilities'    => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'string', 'min' => 2, 'max' => 100)),
      'backend'         => array('type' => 'object', 'strict' => TRUE,
        'default' => array('enabled' => FALSE, 'mode' => 'none', 'routes' => array(), 'webhooks' => array(), 'backgroundJobs' => array(), 'eventHandlers' => array()),
        'children' => array(
          'enabled'        => array('type' => 'bool', 'default' => FALSE),
          'mode'           => array('type' => 'enum', 'values' => array('none', 'external_service'), 'default' => 'none'),
          'routes'         => array('type' => 'array', 'max' => 200, 'default' => array(), 'item' => $route),
          'healthPath'     => array('type' => 'route'),
          'webhooks'       => array('type' => 'array', 'max' => 50, 'default' => array(), 'item' => array('type' => 'route')),
          'backgroundJobs' => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'string', 'min' => 2, 'max' => 100)),
          'eventHandlers'  => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'string', 'min' => 2, 'max' => 120)),
        )),
      'frontend'        => array('type' => 'object', 'strict' => TRUE,
        'default' => array('enabled' => FALSE, 'mode' => 'declarative', 'navigation' => array(), 'pages' => array()),
        'children' => array(
          'enabled'    => array('type' => 'bool', 'default' => FALSE),
          'mode'       => array('type' => 'string', 'literal' => 'declarative', 'default' => 'declarative'),
          'navigation' => array('type' => 'array', 'max' => 20, 'default' => array(), 'item' => array('type' => 'object', 'strict' => TRUE, 'children' => array(
            'label' => array('type' => 'string', 'min' => 1, 'max' => 60),
            'path'  => array('type' => 'route'),
            'icon'  => array('type' => 'string', 'max' => 40, 'default' => 'Puzzle'),
            'order' => array('type' => 'int', 'min' => 0, 'max' => 10000, 'default' => 500),
          ))),
          'pages'      => array('type' => 'array', 'max' => 50, 'default' => array(), 'item' => array('type' => 'object', 'strict' => TRUE, 'children' => array(
            'path'        => array('type' => 'route'),
            'title'       => array('type' => 'string', 'min' => 1, 'max' => 120),
            'description' => array('type' => 'string', 'max' => 500),
            'sections'    => array('type' => 'array', 'max' => 30, 'default' => array(), 'item' => $section),
          ))),
        )),
      'database'        => array('type' => 'object', 'strict' => TRUE,
        'default' => array('migrations' => array(), 'mode' => 'none', 'rollbackFiles' => array(), 'backupRequired' => TRUE),
        'children' => array(
          'migrations'    => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'safe_path')),
          'mode'          => array('type' => 'enum', 'values' => array('none', 'isolated_schema', 'platform_schema'), 'default' => 'none'),
          'rollbackFiles' => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'safe_path')),
          'backupRequired' => array('type' => 'bool', 'default' => TRUE),
        )),
      'agents'          => array('type' => 'object', 'strict' => TRUE, 'default' => array('definitions' => array()),
        'children' => array('definitions' => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'safe_path')))),
      'workflows'       => array('type' => 'object', 'strict' => TRUE, 'default' => array('definitions' => array()),
        'children' => array('definitions' => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'safe_path')))),
      'configuration'   => array('type' => 'object', 'strict' => TRUE, 'default' => array(), 'children' => array(
        'schema'        => array('type' => 'safe_path'),
        'documentation' => array('type' => 'safe_path'),
      )),
      'documentation'   => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'safe_path')),
      'tests'           => array('type' => 'object', 'strict' => TRUE, 'required' => TRUE, 'children' => array(
        'command'    => array('type' => 'string', 'min' => 1, 'max' => 500),
        'categories' => array('type' => 'array', 'min' => 1, 'item' => array('type' => 'enum', 'values' => array('unit', 'integration', 'api', 'database', 'permission', 'security', 'health', 'frontend', 'workflow', 'agent'))),
      )),
      'healthChecks'    => array('type' => 'array', 'min' => 1, 'max' => 20, 'item' => array('type' => 'object', 'strict' => TRUE, 'children' => array(
        'name'      => array('type' => 'string', 'min' => 1, 'max' => 100),
        'type'      => array('type' => 'enum', 'values' => array('http', 'runner')),
        'path'      => array('type' => 'route'),
        'timeoutMs' => array('type' => 'int', 'min' => 100, 'max' => 60000, 'default' => 5000),
      ))),
      'resources'       => array('type' => 'object', 'strict' => TRUE, 'required' => TRUE, 'children' => array(
        'memoryMb'      => array('type' => 'int', 'min' => 16, 'max' => 32768),
        'cpuMillicores' => array('type' => 'int', 'min' => 10, 'max' => 32000),
        'storageMb'     => array('type' => 'int', 'min' => 1, 'max' => 1000000),
        'networkAccess' => array('type' => 'bool', 'default' => FALSE),
      )),
      'lifecycle'       => array('type' => 'object', 'strict' => TRUE,
        'default' => array('reloadSupported' => FALSE, 'removable' => TRUE),
        'children' => array(
          'reloadSupported' => array('type' => 'bool', 'default' => FALSE),
          'removable'       => array('type' => 'bool', 'default' => TRUE),
        )),
      'upgrade'         => array('type' => 'object', 'strict' => TRUE, 'required' => TRUE, 'children' => array(
        'from'             => array('type' => 'array', 'max' => 50, 'default' => array(), 'item' => array('type' => 'string', 'min' => 1, 'max' => 80)),
        'rollbackSupported' => array('type' => 'bool', 'required' => TRUE),
        'allowDowngrade'   => array('type' => 'bool', 'default' => FALSE),
        'requiresDowntime' => array('type' => 'bool', 'default' => FALSE),
        'instructions'     => array('type' => 'safe_path'),
      )),
      'conflicts'       => array('type' => 'object', 'strict' => TRUE,
        'default' => array('moduleIds' => array(), 'capabilities' => array()),
        'children' => array(
          'moduleIds'    => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'string', 'regex' => self::RE_MODULE_ID, 'message' => 'lowercase module id required')),
          'capabilities' => array('type' => 'array', 'max' => 100, 'default' => array(), 'item' => array('type' => 'string', 'min' => 2, 'max' => 100)),
        )),
    ));
  }

  private function walk($value, $spec, $path, &$errors) {
    $type = $spec['type'];
    if ($value === NULL) {
      if (array_key_exists('default', $spec)) return $spec['default'];
      if (!empty($spec['required'])) $errors[] = ($path ? $path : 'value') . ' is required';
      if ($type === 'array' && isset($spec['min'])) $errors[] = ($path ? $path : 'value') . ' requires at least ' . $spec['min'] . ' item(s)';
      return $type === 'array' ? array() : NULL;
    }
    if ($type === 'object') {
      // `{}` decodes to an empty PHP array; treat it as an empty object so a
      // manifest that omits every optional key still validates.
      if (!is_array($value) || ($this->is_list($value) && count($value) > 0)) {
        $errors[] = ($path ? $path . ': ' : '') . 'expected an object';
        return array_key_exists('default', $spec) ? $spec['default'] : NULL;
      }
      $out = array();
      foreach ($spec['children'] as $key => $child) {
        $child_path = $path ? $path . '.' . $key : $key;
        if (array_key_exists($key, $value)) {
          $out[$key] = $this->walk($value[$key], $child, $child_path, $errors);
        } elseif (array_key_exists('default', $child)) {
          $out[$key] = $child['default'];
        } elseif (!empty($child['required'])) {
          $errors[] = $child_path . ' is required';
        }
      }
      if (!empty($spec['strict'])) {
        foreach (array_keys($value) as $key) {
          if (!array_key_exists($key, $spec['children'])) $errors[] = ($path ? $path . '.' : '') . $key . ' is not an allowed property';
        }
      }
      return $out;
    }
    if ($type === 'array') {
      if (!is_array($value) || !$this->is_list($value)) {
        $errors[] = ($path ? $path . ': ' : '') . 'expected an array';
        return array_key_exists('default', $spec) ? $spec['default'] : array();
      }
      if (isset($spec['min']) && count($value) < $spec['min']) $errors[] = $path . ' requires at least ' . $spec['min'] . ' item(s)';
      if (isset($spec['max']) && count($value) > $spec['max']) $errors[] = $path . ' accepts at most ' . $spec['max'] . ' item(s)';
      $out = array();
      foreach ($value as $index => $item) $out[] = $this->walk($item, $spec['item'], $path . '[' . $index . ']', $errors);
      return $out;
    }
    if ($type === 'bool') {
      if (!is_bool($value)) { $errors[] = $path . ' must be a boolean'; return array_key_exists('default', $spec) ? $spec['default'] : NULL; }
      return $value;
    }
    if ($type === 'int') {
      if (!is_int($value)) { $errors[] = $path . ' must be an integer'; return array_key_exists('default', $spec) ? $spec['default'] : NULL; }
      if (isset($spec['min']) && $value < $spec['min']) $errors[] = $path . ' must be >= ' . $spec['min'];
      if (isset($spec['max']) && $value > $spec['max']) $errors[] = $path . ' must be <= ' . $spec['max'];
      if (array_key_exists('literal', $spec) && $value !== $spec['literal']) $errors[] = $path . ' must be ' . $spec['literal'];
      return $value;
    }
    if ($type === 'enum') {
      if (!is_string($value) || !in_array($value, $spec['values'], TRUE)) {
        $errors[] = $path . ' must be one of: ' . implode(', ', $spec['values']);
        return array_key_exists('default', $spec) ? $spec['default'] : NULL;
      }
      return $value;
    }
    if ($type === 'route') {
      if (!is_string($value) || !preg_match(self::RE_ROUTE, $value)) { $errors[] = $path . ' must be a relative API route'; return NULL; }
      if (strpos($value, '..') !== FALSE || strpos($value, '/api/') === 0) { $errors[] = $path . ' routes are mounted below the module gateway'; return NULL; }
      return $value;
    }
    if ($type === 'safe_path') {
      if (!is_string($value) || strlen($value) < 1 || strlen($value) > 240) { $errors[] = $path . ' must be a package-relative path of 1..240 characters'; return NULL; }
      if ($value[0] === '/' || strpos($value, '\\') !== FALSE || in_array('..', explode('/', $value), TRUE)) { $errors[] = $path . ' must be a safe package-relative path'; return NULL; }
      return $value;
    }
    if ($type === 'https_url') {
      if (!is_string($value) || strlen($value) > 2000 || !filter_var($value, FILTER_VALIDATE_URL) || strpos($value, 'https://') !== 0) {
        $errors[] = $path . ' must be an HTTPS URL of at most 2000 characters'; return NULL;
      }
      return $value;
    }
    // string
    if (!is_string($value)) { $errors[] = $path . ' must be a string'; return array_key_exists('default', $spec) ? $spec['default'] : NULL; }
    if (isset($spec['min']) && strlen($value) < $spec['min']) $errors[] = $path . ' must be at least ' . $spec['min'] . ' characters';
    if (isset($spec['max']) && strlen($value) > $spec['max']) $errors[] = $path . ' must be at most ' . $spec['max'] . ' characters';
    if (array_key_exists('literal', $spec) && $value !== $spec['literal']) $errors[] = $path . ' must be "' . $spec['literal'] . '"';
    if (!empty($spec['regex']) && !preg_match($spec['regex'], $value)) $errors[] = $path . ': ' . (isset($spec['message']) ? $spec['message'] : 'invalid format');
    return $value;
  }

  private function is_list($value) {
    if (!is_array($value)) return FALSE;
    if ($value === array()) return TRUE;
    return array_keys($value) === range(0, count($value) - 1);
  }

  /** The zod .superRefine() block. */
  private function refine($manifest, &$errors) {
    $backend = $manifest['backend'];
    $frontend = $manifest['frontend'];
    $database = $manifest['database'];
    if ($backend['enabled'] && $backend['mode'] === 'none') $errors[] = 'backend.mode: enabled backend requires external_service mode';
    if (!$backend['enabled'] && (count($backend['routes']) || count($backend['backgroundJobs']) || count($backend['eventHandlers']))) $errors[] = 'backend: disabled backend cannot declare runtime components';
    if (!$frontend['enabled'] && (count($frontend['navigation']) || count($frontend['pages']))) $errors[] = 'frontend: disabled frontend cannot declare navigation/pages';
    if ($database['mode'] === 'none' && count($database['migrations'])) $errors[] = 'database: migration files require a database mode';
    if (count($database['migrations']) && !count($database['rollbackFiles']) && $manifest['upgrade']['rollbackSupported']) $errors[] = 'database.rollbackFiles: rollback-supported database changes require rollback files';
    $route_keys = array();
    foreach ($backend['routes'] as $route) $route_keys[] = $route['method'] . ' ' . $route['path'];
    if (count($route_keys) !== count(array_unique($route_keys))) $errors[] = 'backend.routes: duplicate API routes are not allowed';
    $page_paths = array();
    foreach ($frontend['pages'] as $page) $page_paths[] = $page['path'];
    if (count($page_paths) !== count(array_unique($page_paths))) $errors[] = 'frontend.pages: duplicate frontend page paths are not allowed';
  }

  // ---------------------------------------------------------------------------
  // Verification (verification.service.ts)
  // ---------------------------------------------------------------------------

  private function check($code, $category, $status, $severity, $message, $evidence = NULL) {
    $row = array('code' => $code, 'category' => $category, 'status' => $status, 'severity' => $severity, 'message' => $message);
    if ($evidence !== NULL) $row['evidence'] = $evidence;
    return $row;
  }

  public function publisher_keys() {
    $raw = getenv('VP_MODULE_TRUSTED_PUBLISHER_KEYS');
    if ($raw === FALSE || trim($raw) === '') return array();
    $parsed = json_decode($raw, TRUE);
    return is_array($parsed) ? $parsed : array();
  }

  /**
   * Detached publisher signature over `windels-module:<sha256>`.
   *
   * Node verifies Ed25519 with Node's crypto. PHP's coverage of Ed25519 depends
   * on the host: ext-sodium can verify it directly, and OpenSSL only exposes it
   * as a prehashed (Ed25519ph) mode through openssl_verify. So the registry may
   * hold either key type, and the key decides the verifier:
   *
   *   * Ed25519 subjectPublicKeyInfo (OID 1.3.101.112) -> sodium when present;
   *     otherwise the check reports SIGNATURE_UNVERIFIABLE rather than passing,
   *     because "could not check" must never look like "checked and clean".
   *   * RSA/ECDSA -> openssl_verify with SHA-256/512.
   */
  public function verify_signature($checksum, $key_id, $signature) {
    if (!$key_id || !$signature) return $this->check('SIGNATURE_REQUIRED', 'signature', 'FAILED', 'critical', 'A detached Ed25519 package signature and trusted publisher key ID are required.');
    $keys = $this->publisher_keys();
    if (!isset($keys[$key_id]) || !is_string($keys[$key_id])) return $this->check('PUBLISHER_KEY_UNTRUSTED', 'signature', 'FAILED', 'critical', "Publisher key {$key_id} is not in the trusted key registry.");
    $pem = $keys[$key_id];
    $der = $this->pem_to_der($pem);
    if ($der === NULL) return $this->check('SIGNATURE_INVALID', 'signature', 'FAILED', 'critical', 'The trusted publisher key could not be parsed.', array('keyId' => $key_id));
    $binary = base64_decode($signature, TRUE);
    if ($binary === FALSE) return $this->check('SIGNATURE_INVALID', 'signature', 'FAILED', 'critical', 'Detached package signature is not valid base64.', array('keyId' => $key_id));
    $data = self::SIGNING_PREFIX . $checksum;

    if ($this->is_ed25519($der)) {
      if (function_exists('sodium_crypto_sign_verify_detached')) {
        $raw = substr($der, -32);
        $verified = strlen($raw) === 32 && @sodium_crypto_sign_verify_detached($binary, $data, $raw) === TRUE;
      } else {
        $verified = FALSE;
        $public = @openssl_pkey_get_public($pem);
        if ($public) {
          // Only Ed25519ph is reachable through openssl_verify; a raw Ed25519
          // signature will not match it, so this is a last resort, not a path.
          foreach (array(4, 5) as $algorithm) {
            if (@openssl_verify($data, $binary, $public, $algorithm) === 1) { $verified = TRUE; break; }
          }
        }
        if (!$verified) {
          return $this->check('SIGNATURE_UNVERIFIABLE', 'signature', 'FAILED', 'critical',
            'This host cannot verify Ed25519: ext-sodium is not loaded and OpenSSL exposes only the prehashed variant. Install an RSA/ECDSA publisher key instead.',
            array('keyId' => $key_id));
        }
      }
      return $verified
        ? $this->check('SIGNATURE_VERIFIED', 'signature', 'PASSED', 'info', "Detached Ed25519 signature verified with key {$key_id}.", array('keyId' => $key_id))
        : $this->check('SIGNATURE_INVALID', 'signature', 'FAILED', 'critical', 'Detached package signature does not match the uploaded bytes.', array('keyId' => $key_id));
    }

    $public = @openssl_pkey_get_public($pem);
    if (!$public) return $this->check('SIGNATURE_INVALID', 'signature', 'FAILED', 'critical', 'The trusted publisher key could not be parsed.', array('keyId' => $key_id));
    $verified = FALSE;
    foreach (array(OPENSSL_ALGO_SHA256, OPENSSL_ALGO_SHA512) as $algorithm) {
      $result = @openssl_verify($data, $binary, $public, $algorithm);
      if ($result === 1) { $verified = TRUE; break; }
    }
    return $verified
      ? $this->check('SIGNATURE_VERIFIED', 'signature', 'PASSED', 'info', "Detached signature verified with key {$key_id}.", array('keyId' => $key_id))
      : $this->check('SIGNATURE_INVALID', 'signature', 'FAILED', 'critical', 'Detached package signature does not match the uploaded bytes.', array('keyId' => $key_id));
  }

  /** Base64 body of a PEM block, or NULL when the key is not a PEM. */
  private function pem_to_der($pem) {
    if (!is_string($pem) || strpos($pem, '-----BEGIN') === FALSE) return NULL;
    $body = preg_replace('/-----[^-]+-----|\s+/', '', $pem);
    $der = base64_decode($body, TRUE);
    return $der === FALSE || strlen($der) < 16 ? NULL : $der;
  }

  /** Ed25519 subjectPublicKeyInfo carries OID 1.3.101.112 (06 03 2b 65 70). */
  private function is_ed25519($der) {
    return strpos($der, "\x06\x03\x2b\x65\x70") !== FALSE;
  }

  /**
   * Optional ClamAV INSTREAM scan. Without VP_CLAMD_HOST this reports
   * not_configured, and because that check is critical the report fails closed
   * -- the same posture the Node service takes.
   */
  public function malware_scan($path) {
    $host = getenv('VP_CLAMD_HOST');
    $port = (int) (getenv('VP_CLAMD_PORT') ?: 3310);
    if ($host === FALSE || trim($host) === '') return array('status' => 'not_configured', 'detail' => 'VP_CLAMD_HOST is not set');
    $socket = @fsockopen($host, $port, $errno, $errtext, 5);
    if (!$socket) return array('status' => 'error', 'detail' => "ClamAV unreachable at {$host}:{$port}: {$errtext}");
    $handle = @fopen($path, 'rb');
    if (!$handle) { fclose($socket); return array('status' => 'error', 'detail' => 'Package could not be read for scanning'); }
    fwrite($socket, "zINSTREAM\0");
    while (!feof($handle)) {
      $chunk = fread($handle, 8192);
      if ($chunk === FALSE || $chunk === '') break;
      fwrite($socket, pack('N', strlen($chunk)) . $chunk);
    }
    fclose($handle);
    fwrite($socket, pack('N', 0));
    $response = '';
    while (!feof($socket)) {
      $line = fgets($socket, 4096);
      if ($line === FALSE) break;
      $response .= $line;
      if (strpos($line, "\n") !== FALSE) break;
    }
    fclose($socket);
    $response = trim($response);
    if ($response === '') return array('status' => 'error', 'detail' => 'ClamAV returned an empty response');
    if (strpos($response, 'OK') !== FALSE && stripos($response, 'FOUND') === FALSE) return array('status' => 'clean', 'detail' => $response);
    if (stripos($response, 'FOUND') !== FALSE) return array('status' => 'infected', 'detail' => $response, 'signature' => trim(str_replace('FOUND', '', substr($response, strpos($response, ':') + 1))));
    return array('status' => 'error', 'detail' => $response);
  }

  /** Full verification report for a stored package. */
  public function verify($input) {
    $artifact = $input['artifactPath'];
    $checksum = $input['checksum'];
    $actual = @hash_file('sha256', $artifact);
    $checks = array();
    $checks[] = ($actual !== FALSE && $actual === $checksum)
      ? $this->check('CHECKSUM_RECOMPUTED', 'integrity', 'PASSED', 'info', 'Stored package bytes still match the bounded streaming-intake SHA-256.', array('sha256' => $actual))
      : $this->check('CHECKSUM_MISMATCH', 'integrity', 'FAILED', 'critical', 'Stored package bytes changed after intake; verification is blocked.', array('expected' => $checksum, 'actual' => $actual));

    $checks[] = $this->verify_signature($checksum, isset($input['signatureKeyId']) ? $input['signatureKeyId'] : NULL, isset($input['signature']) ? $input['signature'] : NULL);

    $scan = $this->malware_scan($artifact);
    if ($scan['status'] === 'clean') $checks[] = $this->check('MALWARE_SCAN_CLEAN', 'malware', 'PASSED', 'info', 'ClamAV reported the complete package clean.', array('detail' => $scan['detail']));
    elseif ($scan['status'] === 'infected') $checks[] = $this->check('MALWARE_DETECTED', 'malware', 'FAILED', 'critical', 'Malware detected: ' . (isset($scan['signature']) ? $scan['signature'] : 'unknown signature') . '.', array('detail' => $scan['detail']));
    elseif ($scan['status'] === 'not_configured') $checks[] = $this->check('MALWARE_SCANNER_NOT_CONFIGURED', 'malware', 'NOT_CONFIGURED', 'critical', 'ClamAV is not configured. Production verification fails closed.');
    else $checks[] = $this->check('MALWARE_SCAN_ERROR', 'malware', 'FAILED', 'critical', 'Malware scanner failed: ' . (isset($scan['detail']) ? $scan['detail'] : 'unknown error') . '.');

    $inspection = $input['inspection'];
    $checks[] = $this->check('ARCHIVE_STRUCTURE_VALID', 'integrity', 'PASSED', 'info', 'Archive paths, sizes, compression ratios, links, encryption flags, and manifest structure passed (' . $inspection['fileCount'] . ' files).');
    foreach ($this->static_checks($inspection) as $item) $checks[] = $item;
    foreach ($this->compatibility_checks($inspection, $input) as $item) $checks[] = $item;

    $passed = TRUE;
    foreach ($checks as $item) if ($item['severity'] === 'critical' && $item['status'] !== 'PASSED') $passed = FALSE;

    return array(
      'releaseId'         => $input['releaseId'],
      'checksum'          => $checksum,
      'verifiedAt'        => gmdate('c'),
      'passed'            => $passed,
      'checks'            => $checks,
      'fileCount'         => $inspection['fileCount'],
      'compressedBytes'   => $inspection['compressedBytes'],
      'uncompressedBytes' => $inspection['uncompressedBytes'],
    );
  }

  private function static_checks($inspection) {
    $checks = array();
    $manifest = $inspection['manifest'];
    $paths = array();
    foreach ($inspection['entries'] as $entry) if (substr($entry['name'], -1) !== '/') $paths[$entry['name']] = TRUE;

    $references = array_merge(
      $manifest['database']['migrations'], $manifest['database']['rollbackFiles'],
      $manifest['agents']['definitions'], $manifest['workflows']['definitions'],
      $manifest['documentation']
    );
    if (!empty($manifest['configuration']['schema'])) $references[] = $manifest['configuration']['schema'];
    if (!empty($manifest['configuration']['documentation'])) $references[] = $manifest['configuration']['documentation'];
    if (!empty($manifest['upgrade']['instructions'])) $references[] = $manifest['upgrade']['instructions'];
    $missing = array();
    foreach ($references as $file) if (!isset($paths[$file])) $missing[] = $file;
    $checks[] = count($missing)
      ? $this->check('DECLARED_FILES_MISSING', 'manifest', 'FAILED', 'critical', 'Manifest references ' . count($missing) . ' missing file(s).', array('files' => array_slice($missing, 0, 50)))
      : $this->check('DECLARED_FILES_PRESENT', 'manifest', 'PASSED', 'info', 'All manifest-declared files are present.');

    if (isset($inspection['textFiles']['package.json'])) {
      $decoded = json_decode($inspection['textFiles']['package.json'], TRUE);
      if (!is_array($decoded)) {
        $checks[] = $this->check('PACKAGE_JSON_INVALID', 'manifest', 'FAILED', 'critical', 'package.json is not valid JSON.');
      } else {
        $scripts = isset($decoded['scripts']) && is_array($decoded['scripts']) ? $decoded['scripts'] : array();
        $lifecycle = array();
        foreach (array('preinstall', 'install', 'postinstall', 'prepare') as $name) if (isset($scripts[$name]) && is_string($scripts[$name])) $lifecycle[] = $name;
        $checks[] = count($lifecycle)
          ? $this->check('INSTALL_LIFECYCLE_SCRIPTS', 'migration', 'FAILED', 'critical', 'Package manager lifecycle scripts are not permitted in installable modules.', array('scripts' => $lifecycle))
          : $this->check('NO_INSTALL_LIFECYCLE_SCRIPTS', 'migration', 'PASSED', 'info', 'No package-manager install lifecycle scripts were declared.');
      }
    }

    $risk_patterns = array(
      '#\bchild_process\b|\bexecSync\s*\(|\bspawnSync\s*\(#' => 'process execution',
      '#\beval\s*\(|new\s+Function\s*\(#'                    => 'dynamic code execution',
      '#process\.binding\s*\(|process\._linkedBinding\s*\(#' => 'native process binding',
      '#\b(?:curl|wget)\b.+https?://#'                       => 'network download command',
    );
    $sql_critical = array(
      '#\bDROP\s+(?:DATABASE|SCHEMA)\b#i'        => 'drop database/schema',
      '#\bALTER\s+SYSTEM\b#i'                    => 'alter system',
      '#\bCOPY\b[\s\S]{0,200}\bPROGRAM\b#i'      => 'database program execution',
      '#\bTRUNCATE\b#i'                          => 'truncate data',
    );
    $risky = array();
    $critical = array();
    foreach ($inspection['textFiles'] as $file => $content) {
      foreach ($risk_patterns as $pattern => $label) if (preg_match($pattern, $content)) $risky[] = array('file' => $file, 'pattern' => $label);
      if (preg_match('#\.sql$#i', $file)) foreach ($sql_critical as $pattern => $label) if (preg_match($pattern, $content)) $critical[] = array('file' => $file, 'pattern' => $label);
    }
    $checks[] = count($critical)
      ? $this->check('UNSAFE_MIGRATION_CONTENT', 'migration', 'FAILED', 'critical', 'Destructive or host-executing SQL was found.', array('findings' => array_slice($critical, 0, 50)))
      : $this->check('MIGRATION_STATIC_SCAN', 'migration', 'PASSED', 'info', 'No prohibited destructive SQL patterns were found.');
    $checks[] = count($risky)
      ? $this->check('PRIVILEGED_CODE_PATTERNS', 'compatibility', 'WARNING', 'warning', 'Privileged code patterns require sandbox and security review; uploaded code is not executed in the API process.', array('findings' => array_slice($risky, 0, 50)))
      : $this->check('STATIC_SOURCE_SCAN', 'compatibility', 'PASSED', 'info', 'No privileged source patterns were detected in inspectable text files.');
    return $checks;
  }

  private function compatibility_checks($inspection, $input) {
    $checks = array();
    $manifest = $inspection['manifest'];
    $platform = getenv('VP_PLATFORM_VERSION');
    if ($platform === FALSE || trim($platform) === '') $platform = '0.1.0';
    $minimum_ok = $this->semver_gte($platform, $manifest['minimumVersion']);
    $maximum_ok = empty($manifest['maximumVersion']) || $this->semver_lte($platform, $manifest['maximumVersion']);
    $checks[] = ($minimum_ok && $maximum_ok)
      ? $this->check('PLATFORM_VERSION_COMPATIBLE', 'compatibility', 'PASSED', 'info', "Platform {$platform} is within the declared compatibility range.")
      : $this->check('PLATFORM_VERSION_INCOMPATIBLE', 'compatibility', 'FAILED', 'critical', "Platform {$platform} is outside {$manifest['minimumVersion']}.." . (empty($manifest['maximumVersion']) ? 'unbounded' : $manifest['maximumVersion']) . '.');

    $known = isset($input['knownPermissions']) ? $input['knownPermissions'] : array();
    $unknown_permissions = array();
    foreach ($manifest['permissions'] as $permission) if (!in_array($permission, $known, TRUE)) $unknown_permissions[] = $permission;
    foreach ($manifest['backend']['routes'] as $route) if (!in_array($route['permission'], $known, TRUE)) $unknown_permissions[] = $route['permission'];
    $unknown_permissions = array_values(array_unique($unknown_permissions));
    $checks[] = count($unknown_permissions)
      ? $this->check('UNKNOWN_PLATFORM_PERMISSIONS', 'permission', 'FAILED', 'critical', 'Module requests permissions not defined by WINDELS IAM.', array('permissions' => $unknown_permissions))
      : $this->check('PERMISSIONS_REUSED', 'permission', 'PASSED', 'info', 'All requested permissions reuse the existing WINDELS permission catalog.');

    $installed = isset($input['installedModules']) ? $input['installedModules'] : array();
    $failures = array();
    foreach ($manifest['dependencies'] as $dependency) {
      if (!isset($installed[$dependency['id']])) { if (!$dependency['optional']) $failures[] = array('id' => $dependency['id'], 'reason' => 'not installed'); continue; }
      $current = $installed[$dependency['id']]['currentVersion'];
      if ($current && !$this->semver_satisfies($current, $dependency['version']) && !$dependency['optional']) {
        $failures[] = array('id' => $dependency['id'], 'reason' => "installed {$current} does not satisfy {$dependency['version']}");
      }
    }
    $checks[] = count($failures)
      ? $this->check('DEPENDENCIES_UNSATISFIED', 'dependency', 'FAILED', 'critical', 'Required module dependencies are not satisfied.', array('dependencies' => $failures))
      : $this->check('DEPENDENCIES_SATISFIED', 'dependency', 'PASSED', 'info', 'Required module dependencies are satisfied.');

    $conflicts = array();
    $capability_conflicts = array();
    foreach ($installed as $key => $module) {
      if (in_array($key, $manifest['conflicts']['moduleIds'], TRUE)) $conflicts[] = $key;
      $capabilities = isset($module['capabilities']) ? $module['capabilities'] : array();
      foreach ($capabilities as $capability) if (in_array($capability, $manifest['conflicts']['capabilities'], TRUE)) $capability_conflicts[] = array('moduleId' => $key, 'capability' => $capability);
    }
    $checks[] = (count($conflicts) || count($capability_conflicts))
      ? $this->check('MODULE_CONFLICT', 'conflict', 'FAILED', 'critical', 'Declared module or capability conflicts are active.', array('modules' => $conflicts, 'capabilities' => $capability_conflicts))
      : $this->check('NO_DECLARED_CONFLICTS', 'conflict', 'PASSED', 'info', 'No declared module or capability conflicts are active.');

    $max_memory = (int) (getenv('VP_MODULE_MAX_MEMORY_MB') ?: 4096);
    $max_cpu = (int) (getenv('VP_MODULE_MAX_CPU_MILLICORES') ?: 4000);
    $resource_ok = $manifest['resources']['memoryMb'] <= $max_memory && $manifest['resources']['cpuMillicores'] <= $max_cpu;
    $checks[] = $resource_ok
      ? $this->check('RESOURCE_LIMITS_ACCEPTED', 'resource', 'PASSED', 'info', 'Declared resources are inside platform policy.', $manifest['resources'])
      : $this->check('RESOURCE_LIMITS_EXCEEDED', 'resource', 'FAILED', 'critical', "Declared resources exceed policy ({$max_memory} MB, {$max_cpu} millicores).", $manifest['resources']);
    return $checks;
  }

  // ---------------------------------------------------------------------------
  // Minimal semver (comparison + the range subset manifests actually use)
  // ---------------------------------------------------------------------------

  public function semver_parts($version) {
    if (!preg_match('/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/', (string) $version, $m)) return NULL;
    return array((int) $m[1], (int) $m[2], (int) $m[3], isset($m[4]) ? $m[4] : '');
  }

  private function semver_compare($a, $b) {
    $left = $this->semver_parts($a);
    $right = $this->semver_parts($b);
    if (!$left || !$right) return 0;
    for ($i = 0; $i < 3; $i++) if ($left[$i] !== $right[$i]) return $left[$i] < $right[$i] ? -1 : 1;
    return strcmp($left[3], $right[3]);
  }
  public function semver_gte($a, $b) { return $this->semver_compare($a, $b) >= 0; }
  public function semver_lte($a, $b) { return $this->semver_compare($a, $b) <= 0; }
  public function semver_lt($a, $b)  { return $this->semver_compare($a, $b) < 0; }

  /** Supports =, >, >=, <, <=, ^, ~, x-ranges and || alternatives. */
  public function semver_satisfies($version, $range) {
    $range = trim((string) $range);
    if ($range === '' || $range === '*') return TRUE;
    foreach (explode('||', $range) as $alternative) {
      if ($this->range_matches($version, trim($alternative))) return TRUE;
    }
    return FALSE;
  }

  private function range_matches($version, $range) {
    if (preg_match('/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/', $range, $m)) {
      $parts = $this->semver_parts($version);
      if (!$parts) return FALSE;
      $major = (int) $m[1];
      if ($parts[0] !== $major) return FALSE;
      if (isset($m[2]) && $m[2] !== '' && $parts[1] !== (int) $m[2]) return FALSE;
      if (isset($m[3]) && $m[3] !== '' && $parts[2] !== (int) $m[3]) return FALSE;
      return TRUE;
    }
    if (preg_match('/^([\^~])\s*(\d+)\.(\d+)\.(\d+)$/', $range, $m) || preg_match('/^([\^~])\s*(\d+)\.(\d+)$/', $range, $m) || preg_match('/^([\^~])\s*(\d+)$/', $range, $m)) {
      $base = array((int) $m[2], isset($m[3]) ? (int) $m[3] : 0, isset($m[4]) ? (int) $m[4] : 0);
      $parts = $this->semver_parts($version);
      if (!$parts) return FALSE;
      if ($this->semver_compare($version, implode('.', $base)) < 0) return FALSE;
      if ($m[1] === '^') {
        if ($parts[0] !== $base[0]) return FALSE;
        if (!isset($m[3])) return TRUE;
      } else {
        if ($parts[0] !== $base[0] || $parts[1] !== $base[1]) return FALSE;
      }
      return TRUE;
    }
    if (preg_match('/^(>=|<=|>|<|=|\^|~)?\s*(\d+\.\d+\.\d+)$/', $range, $m)) {
      $operator = $m[1] ?: '=';
      $comparison = $this->semver_compare($version, $m[2]);
      switch ($operator) {
        case '>':  return $comparison > 0;
        case '>=': return $comparison >= 0;
        case '<':  return $comparison < 0;
        case '<=': return $comparison <= 0;
        default:   return $comparison === 0;
      }
    }
    return $this->semver_compare($version, ltrim($range, 'v=<>^~ ')) === 0;
  }
}

/** Raised for any package that must be quarantined instead of registered. */
class Module_package_error extends Exception {}
