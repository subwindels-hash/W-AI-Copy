// Session 199 — generator for the WINDELS language catalog.
// Emits apps/api/src/languageLearning/catalog.data.ts from a single data table
// so the ~250-language library stays consistent and maintainable.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../../apps/api/src/languageLearning/catalog.data.ts");

// Learning packs authored in curriculum.ts (base codes) mapped to catalog code.
// These entries get learningSupported = true.
const LEARNING = new Set([
  "nl","es","it","fr","de","en","pt-BR","ar","zh-Hans","ja","ko","ru","hi","tr",
  "sw","yo","ig","ha","af","zu","id","vi","pl","sv","el","he","th","uk","fil",
]);

// Columns: code, name, native, iso6391/iso639-3, bcp47, script, dir, family, variantLabel, region, aliases
// dir defaults LTR; RTL flagged explicitly.
const D = (code, name, native, iso, bcp47, script, family, opts = {}) => ({
  code, name, native: native || name, iso, bcp47, script,
  dir: opts.rtl ? "RTL" : "LTR", family,
  variantLabel: opts.variant ?? null, region: opts.region ?? null,
  aliases: opts.aliases ?? [],
});

const L = [
  D("ab","Abkhaz","Аҧсуа","ab","ab","CYRILLIC","Northwest Caucasian"),
  D("ace","Acehnese","Bahsa Acèh","ace","ace","LATIN","Austronesian"),
  D("ach","Acholi","Leb Acoli","ach","ach","LATIN","Nilotic"),
  D("aa","Afar","Qafar","aa","aa","LATIN","Cushitic"),
  D("af","Afrikaans","Afrikaans","af","af","LATIN","Germanic"),
  D("sq","Albanian","Shqip","sq","sq","LATIN","Albanian"),
  D("alz","Alur","Alur","alz","alz","LATIN","Nilotic"),
  D("am","Amharic","አማርኛ","am","am","ETHIOPIC","Semitic"),
  D("ar","Arabic","العربية","ar","ar","ARABIC","Semitic",{rtl:true,aliases:["عربي"]}),
  D("hy","Armenian","Հայերեն","hy","hy","ARMENIAN","Armenian"),
  D("as","Assamese","অসমীয়া","as","as","BENGALI","Indo-Aryan"),
  D("av","Avar","Авар","av","av","CYRILLIC","Northeast Caucasian"),
  D("awa","Awadhi","अवधी","awa","awa","DEVANAGARI","Indo-Aryan"),
  D("ay","Aymara","Aymar aru","ay","ay","LATIN","Aymaran"),
  D("az","Azerbaijani","Azərbaycan","az","az","LATIN","Turkic"),
  D("ban","Balinese","Basa Bali","ban","ban","LATIN","Austronesian"),
  D("bal","Baluchi","بلۏچی","bal","bal","ARABIC","Iranian",{rtl:true}),
  D("bm","Bambara","Bamanankan","bm","bm","LATIN","Mande"),
  D("bci","Baoulé","Wawle","bci","bci","LATIN","Kwa"),
  D("ba","Bashkir","Башҡортса","ba","ba","CYRILLIC","Turkic"),
  D("eu","Basque","Euskara","eu","eu","LATIN","Language isolate"),
  D("btx","Batak Karo","Cakap Karo","btx","btx","LATIN","Austronesian"),
  D("bts","Batak Simalungun","Sahap Simalungun","bts","bts","LATIN","Austronesian"),
  D("bbc","Batak Toba","Hata Batak Toba","bbc","bbc","LATIN","Austronesian"),
  D("be","Belarusian","Беларуская","be","be","CYRILLIC","Slavic"),
  D("bem","Bemba","Ichibemba","bem","bem","LATIN","Bantu"),
  D("bn","Bengali","বাংলা","bn","bn","BENGALI","Indo-Aryan",{aliases:["bangla"]}),
  D("bew","Betawi","Betawi","bew","bew","LATIN","Malayic Creole"),
  D("bho","Bhojpuri","भोजपुरी","bho","bho","DEVANAGARI","Indo-Aryan"),
  D("bik","Bikol","Bikol","bik","bik","LATIN","Austronesian"),
  D("bs","Bosnian","Bosanski","bs","bs","LATIN","Slavic"),
  D("br","Breton","Brezhoneg","br","br","LATIN","Celtic"),
  D("bg","Bulgarian","Български","bg","bg","CYRILLIC","Slavic"),
  D("bua","Buryat","Буряад","bua","bua","CYRILLIC","Mongolic"),
  D("yue","Cantonese","粵語","yue","yue","HAN","Sinitic"),
  D("ca","Catalan","Català","ca","ca","LATIN","Romance"),
  D("ceb","Cebuano","Cebuano","ceb","ceb","LATIN","Austronesian"),
  D("ch","Chamorro","Chamoru","ch","ch","LATIN","Austronesian"),
  D("ce","Chechen","Нохчийн","ce","ce","CYRILLIC","Northeast Caucasian"),
  D("ny","Chichewa","Chichewa","ny","ny","LATIN","Bantu",{aliases:["nyanja"]}),
  D("zh-Hans","Chinese (Simplified)","简体中文","zh","zh-Hans","HAN","Sinitic",{variant:"Simplified",aliases:["chinese","mandarin","zhongwen","中文"]}),
  D("zh-Hant","Chinese (Traditional)","繁體中文","zh","zh-Hant","HAN","Sinitic",{variant:"Traditional",aliases:["chinese","mandarin","繁体"]}),
  D("chk","Chuukese","Chuuk","chk","chk","LATIN","Austronesian"),
  D("cv","Chuvash","Чӑваш","cv","cv","CYRILLIC","Turkic"),
  D("co","Corsican","Corsu","co","co","LATIN","Romance"),
  D("crh-Cyrl","Crimean Tatar (Cyrillic)","Къырымтатар","crh","crh-Cyrl","CYRILLIC","Turkic",{variant:"Cyrillic"}),
  D("crh-Latn","Crimean Tatar (Latin)","Qırımtatar","crh","crh-Latn","LATIN","Turkic",{variant:"Latin"}),
  D("hr","Croatian","Hrvatski","hr","hr","LATIN","Slavic"),
  D("cs","Czech","Čeština","cs","cs","LATIN","Slavic"),
  D("da","Danish","Dansk","da","da","LATIN","Germanic"),
  D("prs","Dari","دری","prs","prs","ARABIC","Iranian",{rtl:true}),
  D("dv","Dhivehi","ދިވެހި","dv","dv","THAANA","Indo-Aryan",{rtl:true,aliases:["maldivian"]}),
  D("din","Dinka","Thuɔŋjäŋ","din","din","LATIN","Nilotic"),
  D("doi","Dogri","डोगरी","doi","doi","DEVANAGARI","Indo-Aryan"),
  D("dov","Dombe","Dombe","dov","dov","LATIN","Bantu"),
  D("nl","Dutch","Nederlands","nl","nl","LATIN","Germanic",{aliases:["nederlands","flemish"]}),
  D("dyu","Dyula","Julakan","dyu","dyu","LATIN","Mande"),
  D("dz","Dzongkha","རྫོང་ཁ","dz","dz","TIBETAN","Sino-Tibetan"),
  D("en","English","English","en","en","LATIN","Germanic"),
  D("eo","Esperanto","Esperanto","eo","eo","LATIN","Constructed"),
  D("et","Estonian","Eesti","et","et","LATIN","Uralic"),
  D("ee","Ewe","Eʋegbe","ee","ee","LATIN","Kwa"),
  D("fo","Faroese","Føroyskt","fo","fo","LATIN","Germanic"),
  D("fj","Fijian","Na Vosa Vakaviti","fj","fj","LATIN","Austronesian"),
  D("fil","Filipino","Filipino","fil","fil","LATIN","Austronesian",{aliases:["tagalog","tl"]}),
  D("fi","Finnish","Suomi","fi","fi","LATIN","Uralic"),
  D("fon","Fon","Fɔngbe","fon","fon","LATIN","Kwa"),
  D("fr","French","Français","fr","fr","LATIN","Romance",{aliases:["francais","français"]}),
  D("fr-CA","French (Canada)","Français canadien","fr","fr-CA","LATIN","Romance",{variant:"Canada",region:"CA",aliases:["quebecois","canadian french"]}),
  D("fy","Frisian","Frysk","fy","fy","LATIN","Germanic"),
  D("fur","Friulian","Furlan","fur","fur","LATIN","Romance"),
  D("ff","Fulani","Fulfulde","ff","ff","LATIN","Senegambian",{aliases:["fula","fulah"]}),
  D("gaa","Ga","Gã","gaa","gaa","LATIN","Kwa"),
  D("gl","Galician","Galego","gl","gl","LATIN","Romance"),
  D("ka","Georgian","ქართული","ka","ka","GEORGIAN","Kartvelian"),
  D("de","German","Deutsch","de","de","LATIN","Germanic",{aliases:["deutsch"]}),
  D("el","Greek","Ελληνικά","el","el","GREEK","Hellenic"),
  D("gn","Guarani","Avañeʼẽ","gn","gn","LATIN","Tupian"),
  D("gu","Gujarati","ગુજરાતી","gu","gu","GUJARATI","Indo-Aryan"),
  D("ht","Haitian Creole","Kreyòl Ayisyen","ht","ht","LATIN","French Creole",{aliases:["kreyol"]}),
  D("cnh","Hakha Chin","Laiholh","cnh","cnh","LATIN","Sino-Tibetan"),
  D("ha","Hausa","Hausa","ha","ha","LATIN","Chadic"),
  D("haw","Hawaiian","ʻŌlelo Hawaiʻi","haw","haw","LATIN","Austronesian"),
  D("he","Hebrew","עברית","he","he","HEBREW","Semitic",{rtl:true,aliases:["ivrit","iw"]}),
  D("hil","Hiligaynon","Ilonggo","hil","hil","LATIN","Austronesian"),
  D("hi","Hindi","हिन्दी","hi","hi","DEVANAGARI","Indo-Aryan"),
  D("hmn","Hmong","Hmoob","hmn","hmn","LATIN","Hmong-Mien"),
  D("hu","Hungarian","Magyar","hu","hu","LATIN","Uralic"),
  D("hrx","Hunsrik","Hunsrik","hrx","hrx","LATIN","Germanic"),
  D("iba","Iban","Jaku Iban","iba","iba","LATIN","Austronesian"),
  D("is","Icelandic","Íslenska","is","is","LATIN","Germanic"),
  D("ig","Igbo","Igbo","ig","ig","LATIN","Volta-Niger"),
  D("ilo","Ilocano","Ilokano","ilo","ilo","LATIN","Austronesian"),
  D("id","Indonesian","Bahasa Indonesia","id","id","LATIN","Austronesian"),
  D("iu-Latn","Inuktut (Latin)","Inuktitut","iu","iu-Latn","LATIN","Eskimo-Aleut",{variant:"Latin"}),
  D("iu","Inuktut (Syllabics)","ᐃᓄᒃᑎᑐᑦ","iu","iu","SYLLABICS","Eskimo-Aleut",{variant:"Syllabics"}),
  D("ga","Irish","Gaeilge","ga","ga","LATIN","Celtic"),
  D("it","Italian","Italiano","it","it","LATIN","Romance"),
  D("jam","Jamaican Patois","Patwa","jam","jam","LATIN","English Creole"),
  D("ja","Japanese","日本語","ja","ja","HIRAGANA_KANJI","Japonic"),
  D("jv","Javanese","Basa Jawa","jv","jv","LATIN","Austronesian"),
  D("kac","Jingpo","Jinghpaw","kac","kac","LATIN","Sino-Tibetan"),
  D("kl","Kalaallisut","Kalaallisut","kl","kl","LATIN","Eskimo-Aleut",{aliases:["greenlandic"]}),
  D("kn","Kannada","ಕನ್ನಡ","kn","kn","KANNADA","Dravidian"),
  D("kr","Kanuri","Kanuri","kr","kr","LATIN","Saharan"),
  D("pam","Kapampangan","Kapampangan","pam","pam","LATIN","Austronesian"),
  D("kk","Kazakh","Қазақ","kk","kk","CYRILLIC","Turkic"),
  D("kha","Khasi","Ka Ktien Khasi","kha","kha","LATIN","Austroasiatic"),
  D("km","Khmer","ខ្មែរ","km","km","KHMER","Austroasiatic"),
  D("cgg","Kiga","Rukiga","cgg","cgg","LATIN","Bantu"),
  D("kg","Kikongo","Kikongo","kg","kg","LATIN","Bantu"),
  D("rw","Kinyarwanda","Ikinyarwanda","rw","rw","LATIN","Bantu"),
  D("ktu","Kituba","Kituba","ktu","ktu","LATIN","Bantu Creole"),
  D("trp","Kokborok","Kokborok","trp","trp","LATIN","Sino-Tibetan"),
  D("kv","Komi","Коми","kv","kv","CYRILLIC","Uralic"),
  D("gom","Konkani","कोंकणी","gom","gom","DEVANAGARI","Indo-Aryan"),
  D("ko","Korean","한국어","ko","ko","HANGUL","Koreanic"),
  D("kri","Krio","Krio","kri","kri","LATIN","English Creole"),
  D("kmr","Kurdish (Kurmanji)","Kurmancî","kmr","kmr","LATIN","Iranian",{variant:"Kurmanji"}),
  D("ckb","Kurdish (Sorani)","سۆرانی","ckb","ckb","ARABIC","Iranian",{rtl:true,variant:"Sorani"}),
  D("ky","Kyrgyz","Кыргызча","ky","ky","CYRILLIC","Turkic"),
  D("lo","Lao","ລາວ","lo","lo","LAO","Tai-Kadai"),
  D("ltg","Latgalian","Latgaļu","ltg","ltg","LATIN","Baltic"),
  D("la","Latin","Latina","la","la","LATIN","Italic"),
  D("lv","Latvian","Latviešu","lv","lv","LATIN","Baltic"),
  D("lij","Ligurian","Ligure","lij","lij","LATIN","Romance"),
  D("li","Limburgish","Limburgs","li","li","LATIN","Germanic"),
  D("ln","Lingala","Lingála","ln","ln","LATIN","Bantu"),
  D("lt","Lithuanian","Lietuvių","lt","lt","LATIN","Baltic"),
  D("lmo","Lombard","Lombard","lmo","lmo","LATIN","Romance"),
  D("lg","Luganda","Luganda","lg","lg","LATIN","Bantu",{aliases:["ganda"]}),
  D("luo","Luo","Dholuo","luo","luo","LATIN","Nilotic"),
  D("lb","Luxembourgish","Lëtzebuergesch","lb","lb","LATIN","Germanic"),
  D("mk","Macedonian","Македонски","mk","mk","CYRILLIC","Slavic"),
  D("mad","Madurese","Madhurâ","mad","mad","LATIN","Austronesian"),
  D("mai","Maithili","मैथिली","mai","mai","DEVANAGARI","Indo-Aryan"),
  D("mak","Makassar","Mangkasara","mak","mak","LATIN","Austronesian"),
  D("mg","Malagasy","Malagasy","mg","mg","LATIN","Austronesian"),
  D("ms","Malay","Bahasa Melayu","ms","ms","LATIN","Austronesian"),
  D("ms-Arab","Malay (Jawi)","بهاس ملايو","ms","ms-Arab","ARABIC","Austronesian",{rtl:true,variant:"Jawi"}),
  D("ml","Malayalam","മലയാളം","ml","ml","MALAYALAM","Dravidian"),
  D("mt","Maltese","Malti","mt","mt","LATIN","Semitic"),
  D("mam","Mam","Qyol Mam","mam","mam","LATIN","Mayan"),
  D("gv","Manx","Gaelg","gv","gv","LATIN","Celtic"),
  D("mi","Maori","Te Reo Māori","mi","mi","LATIN","Austronesian"),
  D("mr","Marathi","मराठी","mr","mr","DEVANAGARI","Indo-Aryan"),
  D("mh","Marshallese","Kajin M̧ajeļ","mh","mh","LATIN","Austronesian"),
  D("mwr","Marwadi","मारवाड़ी","mwr","mwr","DEVANAGARI","Indo-Aryan",{aliases:["marwari"]}),
  D("mfe","Mauritian Creole","Kreol Morisien","mfe","mfe","LATIN","French Creole"),
  D("mhr","Meadow Mari","Олык марий","mhr","mhr","CYRILLIC","Uralic"),
  D("mni","Meiteilon (Manipuri)","ꯃꯤꯇꯩꯂꯣꯟ","mni","mni","MEITEI","Sino-Tibetan",{aliases:["manipuri"]}),
  D("min","Minang","Baso Minang","min","min","LATIN","Austronesian",{aliases:["minangkabau"]}),
  D("lus","Mizo","Mizo ṭawng","lus","lus","LATIN","Sino-Tibetan"),
  D("mn","Mongolian","Монгол","mn","mn","CYRILLIC","Mongolic"),
  D("my","Myanmar (Burmese)","မြန်မာ","my","my","MYANMAR","Sino-Tibetan",{aliases:["burmese"]}),
  D("nhe","Nahuatl (Eastern Huasteca)","Nāhuatl","nhe","nhe","LATIN","Uto-Aztecan",{variant:"Eastern Huasteca"}),
  D("ndc","Ndau","Chindau","ndc","ndc","LATIN","Bantu"),
  D("nr","Ndebele (South)","isiNdebele","nr","nr","LATIN","Bantu",{variant:"South"}),
  D("new","Nepalbhasa (Newari)","नेपाल भाषा","new","new","DEVANAGARI","Sino-Tibetan",{aliases:["newari"]}),
  D("ne","Nepali","नेपाली","ne","ne","DEVANAGARI","Indo-Aryan"),
  D("nqo","NKo","ߒߞߏ","nqo","nqo","NKO","Mande",{rtl:true,aliases:["n'ko","nko"]}),
  D("no","Norwegian","Norsk","no","no","LATIN","Germanic"),
  D("nus","Nuer","Thok Naath","nus","nus","LATIN","Nilotic"),
  D("oc","Occitan","Occitan","oc","oc","LATIN","Romance"),
  D("or","Odia (Oriya)","ଓଡ଼ିଆ","or","or","ODIA","Indo-Aryan",{aliases:["oriya"]}),
  D("om","Oromo","Afaan Oromoo","om","om","LATIN","Cushitic"),
  D("os","Ossetian","Ирон","os","os","CYRILLIC","Iranian"),
  D("pag","Pangasinan","Pangasinan","pag","pag","LATIN","Austronesian"),
  D("pap","Papiamento","Papiamentu","pap","pap","LATIN","Iberian Creole"),
  D("ps","Pashto","پښتو","ps","ps","ARABIC","Iranian",{rtl:true,aliases:["pushto"]}),
  D("fa","Persian","فارسی","fa","fa","ARABIC","Iranian",{rtl:true,aliases:["farsi"]}),
  D("pl","Polish","Polski","pl","pl","LATIN","Slavic"),
  D("pt-BR","Portuguese (Brazil)","Português (Brasil)","pt","pt-BR","LATIN","Romance",{variant:"Brazil",region:"BR",aliases:["portuguese","portugues","brazilian"]}),
  D("pt-PT","Portuguese (Portugal)","Português (Portugal)","pt","pt-PT","LATIN","Romance",{variant:"Portugal",region:"PT",aliases:["portuguese","portugues","european portuguese"]}),
  D("pa","Punjabi (Gurmukhi)","ਪੰਜਾਬੀ","pa","pa","GURMUKHI","Indo-Aryan",{variant:"Gurmukhi",aliases:["punjabi","panjabi"]}),
  D("pa-Arab","Punjabi (Shahmukhi)","پنجابی","pa","pa-Arab","ARABIC","Indo-Aryan",{rtl:true,variant:"Shahmukhi",aliases:["punjabi","panjabi"]}),
  D("qu","Quechua","Runa Simi","qu","qu","LATIN","Quechuan"),
  D("kek","Qʼeqchiʼ","Qʼeqchiʼ","kek","kek","LATIN","Mayan",{aliases:["qeqchi","kekchi"]}),
  D("rom","Romani","Romani ćhib","rom","rom","LATIN","Indo-Aryan"),
  D("ro","Romanian","Română","ro","ro","LATIN","Romance"),
  D("rn","Rundi","Ikirundi","rn","rn","LATIN","Bantu",{aliases:["kirundi"]}),
  D("ru","Russian","Русский","ru","ru","CYRILLIC","Slavic"),
  D("se","Sami (North)","Davvisámegiella","se","se","LATIN","Uralic",{variant:"North",aliases:["sami","saami","northern sami"]}),
  D("sm","Samoan","Gagana Samoa","sm","sm","LATIN","Austronesian"),
  D("sg","Sango","Sängö","sg","sg","LATIN","Ngbandi Creole"),
  D("sa","Sanskrit","संस्कृतम्","sa","sa","DEVANAGARI","Indo-Aryan"),
  D("sat-Latn","Santali (Latin)","Santali","sat","sat-Latn","LATIN","Austroasiatic",{variant:"Latin"}),
  D("sat","Santali (Ol Chiki)","ᱥᱟᱱᱛᱟᱲᱤ","sat","sat","OL_CHIKI","Austroasiatic",{variant:"Ol Chiki"}),
  D("gd","Scots Gaelic","Gàidhlig","gd","gd","LATIN","Celtic",{aliases:["scottish gaelic"]}),
  D("nso","Sepedi","Sepedi","nso","nso","LATIN","Bantu",{aliases:["northern sotho","pedi"]}),
  D("sr","Serbian","Српски","sr","sr","CYRILLIC","Slavic"),
  D("st","Sesotho","Sesotho","st","st","LATIN","Bantu",{aliases:["sotho","southern sotho"]}),
  D("crs","Seychellois Creole","Kreol Seselwa","crs","crs","LATIN","French Creole"),
  D("shn","Shan"," တႆး","shn","shn","MYANMAR","Tai-Kadai"),
  D("sn","Shona","chiShona","sn","sn","LATIN","Bantu"),
  D("scn","Sicilian","Sicilianu","scn","scn","LATIN","Romance"),
  D("szl","Silesian","Ślōnski","szl","szl","LATIN","Slavic"),
  D("sd","Sindhi","سنڌي","sd","sd","ARABIC","Indo-Aryan",{rtl:true}),
  D("si","Sinhala","සිංහල","si","si","SINHALA","Indo-Aryan",{aliases:["sinhalese"]}),
  D("sk","Slovak","Slovenčina","sk","sk","LATIN","Slavic"),
  D("sl","Slovenian","Slovenščina","sl","sl","LATIN","Slavic",{aliases:["slovene"]}),
  D("so","Somali","Soomaali","so","so","LATIN","Cushitic"),
  D("es","Spanish","Español","es","es","LATIN","Romance",{aliases:["espanol","castellano","castilian"]}),
  D("su","Sundanese","Basa Sunda","su","su","LATIN","Austronesian"),
  D("sus","Susu","Sosoxui","sus","sus","LATIN","Mande"),
  D("sw","Swahili","Kiswahili","sw","sw","LATIN","Bantu"),
  D("ss","Swati","siSwati","ss","ss","LATIN","Bantu",{aliases:["swazi"]}),
  D("sv","Swedish","Svenska","sv","sv","LATIN","Germanic"),
  D("ty","Tahitian","Reo Tahiti","ty","ty","LATIN","Austronesian"),
  D("tg","Tajik","Тоҷикӣ","tg","tg","CYRILLIC","Iranian"),
  D("tzm","Tamazight","Tamaziɣt","tzm","tzm","LATIN","Berber",{aliases:["berber","amazigh"]}),
  D("zgh","Tamazight (Tifinagh)","ⵜⴰⵎⴰⵣⵉⵖⵜ","zgh","zgh","TIFINAGH","Berber",{variant:"Tifinagh",aliases:["berber","amazigh"]}),
  D("ta","Tamil","தமிழ்","ta","ta","TAMIL","Dravidian"),
  D("tt","Tatar","Татар","tt","tt","CYRILLIC","Turkic"),
  D("te","Telugu","తెలుగు","te","te","TELUGU","Dravidian"),
  D("tet","Tetum","Tetun","tet","tet","LATIN","Austronesian"),
  D("th","Thai","ไทย","th","th","THAI","Tai-Kadai"),
  D("bo","Tibetan","བོད་སྐད","bo","bo","TIBETAN","Sino-Tibetan"),
  D("ti","Tigrinya","ትግርኛ","ti","ti","ETHIOPIC","Semitic"),
  D("tiv","Tiv","Tiv","tiv","tiv","LATIN","Tivoid"),
  D("tpi","Tok Pisin","Tok Pisin","tpi","tpi","LATIN","English Creole"),
  D("to","Tongan","Lea Fakatonga","to","to","LATIN","Austronesian"),
  D("lua","Tshiluba","Tshiluba","lua","lua","LATIN","Bantu",{aliases:["luba"]}),
  D("ts","Tsonga","Xitsonga","ts","ts","LATIN","Bantu"),
  D("tn","Tswana","Setswana","tn","tn","LATIN","Bantu",{aliases:["setswana"]}),
  D("tcy","Tulu","ತುಳು","tcy","tcy","KANNADA","Dravidian"),
  D("tum","Tumbuka","chiTumbuka","tum","tum","LATIN","Bantu"),
  D("tr","Turkish","Türkçe","tr","tr","LATIN","Turkic"),
  D("tk","Turkmen","Türkmen","tk","tk","LATIN","Turkic"),
  D("tyv","Tuvan","Тыва дыл","tyv","tyv","CYRILLIC","Turkic"),
  D("ak","Twi","Twi","ak","ak","LATIN","Kwa",{aliases:["akan"]}),
  D("udm","Udmurt","Удмурт","udm","udm","CYRILLIC","Uralic"),
  D("uk","Ukrainian","Українська","uk","uk","CYRILLIC","Slavic"),
  D("ur","Urdu","اردو","ur","ur","ARABIC","Indo-Aryan",{rtl:true}),
  D("ug","Uyghur","ئۇيغۇرچە","ug","ug","ARABIC","Turkic",{rtl:true,aliases:["uighur"]}),
  D("uz","Uzbek","Oʻzbek","uz","uz","LATIN","Turkic"),
  D("ve","Venda","Tshivenḓa","ve","ve","LATIN","Bantu",{aliases:["tshivenda"]}),
  D("vec","Venetian","Vèneto","vec","vec","LATIN","Romance"),
  D("vi","Vietnamese","Tiếng Việt","vi","vi","LATIN","Austroasiatic"),
  D("war","Waray","Winaray","war","war","LATIN","Austronesian"),
  D("cy","Welsh","Cymraeg","cy","cy","LATIN","Celtic"),
  D("wo","Wolof","Wolof","wo","wo","LATIN","Senegambian"),
  D("xh","Xhosa","isiXhosa","xh","xh","LATIN","Bantu"),
  D("sah","Yakut","Саха","sah","sah","CYRILLIC","Turkic",{aliases:["sakha"]}),
  D("yi","Yiddish","ייִדיש","yi","yi","HEBREW","Germanic",{rtl:true}),
  D("yo","Yoruba","Yorùbá","yo","yo","LATIN","Volta-Niger"),
  D("yua","Yucatec Maya","Maayaʼ","yua","yua","LATIN","Mayan",{aliases:["maya"]}),
  D("zap","Zapotec","Diidxazá","zap","zap","LATIN","Oto-Manguean"),
  D("zu","Zulu","isiZulu","zu","zu","LATIN","Bantu"),
];

// integrity checks
const seen = new Set();
for (const e of L) {
  if (seen.has(e.code)) throw new Error("duplicate code " + e.code);
  seen.add(e.code);
}
console.error("catalog entries:", L.length);

const esc = (s) => JSON.stringify(s);
const rows = L.map((e) => {
  const learning = LEARNING.has(e.code);
  return `  raw(${esc(e.code)}, ${esc(e.name)}, ${esc(e.native)}, ${esc(e.iso)}, ${esc(e.bcp47)}, ${esc(e.script)}, ${esc(e.dir)}, ${esc(e.family)}, ${e.variantLabel==null?"null":esc(e.variantLabel)}, ${e.region==null?"null":esc(e.region)}, ${learning}, [${e.aliases.map(esc).join(", ")}]),`;
}).join("\n");

const header = `/**
 * WINDELS AI — full language catalog data (Session 199).
 *
 * GENERATED by scripts/gen/genLanguageCatalog.mjs — do not edit by hand.
 * Re-run: \`node scripts/gen/genLanguageCatalog.mjs\`.
 *
 * This is the single source of truth for the ~250-language library. The
 * registry (registry.ts) turns each row into an LlLanguage. Languages can be
 * enabled/disabled and their surfaces toggled from here without touching the
 * UI or routes. \`learningSupported\` is true only where curriculum.ts authors a
 * real pack (resolved via base code); every entry supports translation.
 */
import type { LlTextDirection, LlWritingSystem } from "@windels/shared/languageLearning";

export interface CatalogRow {
  code: string;
  name: string;
  nativeName: string;
  iso6391: string;
  bcp47: string;
  writingSystem: LlWritingSystem;
  textDirection: LlTextDirection;
  family: string;
  variantLabel: string | null;
  region: string | null;
  learningSupported: boolean;
  aliases: string[];
}

function raw(
  code: string, name: string, nativeName: string, iso6391: string, bcp47: string,
  writingSystem: LlWritingSystem, textDirection: LlTextDirection, family: string,
  variantLabel: string | null, region: string | null, learningSupported: boolean,
  aliases: string[],
): CatalogRow {
  return { code, name, nativeName, iso6391, bcp47, writingSystem, textDirection, family, variantLabel, region, learningSupported, aliases };
}

export const CATALOG_ROWS: CatalogRow[] = [
${rows}
];
`;

writeFileSync(OUT, header);
console.error("wrote", OUT);
