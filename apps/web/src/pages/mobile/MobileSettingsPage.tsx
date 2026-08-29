import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, ChevronRight, Fingerprint, Info, Moon, Palette, Shield, Smartphone, WifiOff } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MList, MListItem } from "@/components/mobile/MList";
import { MButton } from "@/components/mobile/MButton";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { subscribePush, sendTestPush, unsubscribePush } from "@/lib/mobile/push";
import { registerBiometric, isBiometricAvailable } from "@/lib/mobile/biometrics";
import { useInstallPrompt } from "@/app/mobile/hooks/useInstallPrompt";
import { listAll } from "@/lib/mobile/offlineQueue";

export function MobileSettingsPage() {
  const nav = useNavigate();
  const { clear, user, deviceId } = useAuthStore();
  const [pushOn, setPushOn] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioAvail, setBioAvail] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const install = useInstallPrompt();

  useEffect(() => {
    setBioOn(localStorage.getItem("windels:biometric") === "1");
    setPushOn(localStorage.getItem("windels:push") === "1");
    isBiometricAvailable().then(setBioAvail);
    listAll().then((a) => setQueuedCount(a.length));
  }, []);

  const togglePush = async () => {
    try {
      if (pushOn) {
        await unsubscribePush();
        localStorage.removeItem("windels:push");
        setPushOn(false);
      } else if (deviceId) {
        await subscribePush(deviceId);
        localStorage.setItem("windels:push", "1");
        setPushOn(true);
      }
    } catch (e: any) { alert(e?.message ?? "Push unavailable"); }
  };
  const testPush = async () => { try { await sendTestPush(); } catch (e) { alert("Push is not available in this context."); } };
  const toggleBio = async () => {
    try {
      if (bioOn) {
        localStorage.removeItem("windels:biometric");
        setBioOn(false);
      } else if (deviceId) {
        await registerBiometric(deviceId);
        localStorage.setItem("windels:biometric", "1");
        setBioOn(true);
      }
    } catch (e: any) { alert(e?.message ?? "Biometric setup failed"); }
  };

  return (
    <div className="pb-10">
      <MobileTopBar title="Settings" />

      <MList header="Account">
        <MListItem label="Profile" icon={<Palette size={18} />} trailing={<ChevronRight size={16} />} onClick={() => nav("/m/profile")} />
        <MListItem label={user?.email ?? "Signed out"} icon={<Shield size={18} />} hint={user?.role ?? "user"} />
      </MList>

      <MList header="Notifications">
        <MListItem
          label="Push notifications"
          icon={<Bell size={18} />}
          trailing={<Switch on={pushOn} onChange={togglePush} />}
        />
        <MListItem label="Send test notification" icon={<BellRing size={18} />} trailing={<ChevronRight size={16} />} onClick={testPush} />
      </MList>

      <MList header="Security">
        {bioAvail && (
          <MListItem
            label="Biometric unlock"
            icon={<Fingerprint size={18} />}
            trailing={<Switch on={bioOn} onChange={toggleBio} />}
            hint="Face ID / Touch ID / Fingerprint"
          />
        )}
        <MListItem label="Privacy & Security" icon={<Shield size={18} />} trailing={<ChevronRight size={16} />} onClick={() => nav("/m/settings/security")} />
      </MList>

      <MList header="Appearance">
        <MListItem label="Dark mode" icon={<Moon size={18} />} trailing={<Switch on={darkMode} onChange={() => setDarkMode((v) => !v)} />} />
      </MList>

      <MList header="App">
        <MListItem label="Install WINDELS AI OS" icon={<Smartphone size={18} />} trailing={<ChevronRight size={16} />} onClick={async () => {
          const r = await install.prompt();
          if (r.outcome !== "accepted") alert("Install cancelled or unavailable.");
        }} />
        <MListItem label="Offline actions" icon={<WifiOff size={18} />} hint={queuedCount ? `${queuedCount} queued` : "All synced"} trailing={<ChevronRight size={16} />} onClick={() => nav("/m/offline")} />
        <MListItem label="About" icon={<Info size={18} />} hint="v0.15.0 · Session 15" trailing={<ChevronRight size={16} />} />
      </MList>

      <div className="px-4 pt-8">
        <MButton variant="danger" size="lg" fullWidth onClick={() => { clear(); nav("/m/auth", { replace: true }); }}>
          Sign out
        </MButton>
      </div>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`relative h-7 w-12 rounded-full transition ${on ? "bg-azure-500" : "bg-white/10"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
