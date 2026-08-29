import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Cog, LogOut, Mail, User as UserIcon } from "lucide-react";
import { MobileTopBar } from "@/app/mobile/MobileTopBar";
import { MAvatar } from "@/components/mobile/MAvatar";
import { MList, MListItem } from "@/components/mobile/MList";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

export function MobileProfilePage() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const nav = useNavigate();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    api.get("/me").then(setProfile).catch(() => {});
  }, []);

  const displayName = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "You";
  const email = user?.email ?? "";

  return (
    <div className="pb-4">
      <MobileTopBar title="Profile" right={
        <Link to="/m/settings" className="h-10 w-10 grid place-items-center rounded-full active:bg-white/10">
          <Cog size={22} />
        </Link>
      } />

      <div className="flex flex-col items-center pt-6 pb-4 px-6">
        <MAvatar name={displayName} color="#3B82F6" size="xl" />
        <h2 className="text-xl font-bold text-text-bright mt-3">{displayName}</h2>
        <p className="text-sm text-text-muted">{email}</p>
        <span className="mt-2 text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-azure-500/20 text-azure-300 font-semibold">
          {user?.role?.replace("_", " ")}
        </span>
      </div>

      <MList header="Account">
        <MListItem label="Edit profile" icon={<UserIcon size={18} />} trailing={<ChevronRight size={16} />} />
        <MListItem label="Email" icon={<Mail size={18} />} hint={email} />
      </MList>

      <MList header="Preferences">
        <MListItem label="Notifications" trailing={<ChevronRight size={16} />} onClick={() => nav("/m/settings")} />
        <MListItem label="Appearance" trailing={<ChevronRight size={16} />} onClick={() => nav("/m/settings")} />
        <MListItem label="Privacy & security" trailing={<ChevronRight size={16} />} onClick={() => nav("/m/settings")} />
      </MList>

      <MList header="Support">
        <MListItem label="Help center" trailing={<ChevronRight size={16} />} onClick={() => nav("/support")} />
        <MListItem label="Legal & privacy" trailing={<ChevronRight size={16} />} onClick={() => nav("/legal")} />
        <MListItem label="About WINDELS AI OS" hint="v0.15.0" trailing={<ChevronRight size={16} />} />
      </MList>

      <div className="px-4 pt-6">
        <button
          onClick={() => { clear(); nav("/m/auth", { replace: true }); }}
          className="w-full h-12 rounded-2xl bg-crimson/10 text-crimson font-semibold flex items-center justify-center gap-2 active:bg-crimson/20"
        >
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  );
}
