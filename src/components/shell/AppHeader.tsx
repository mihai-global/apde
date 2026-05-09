"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon, SearchIcon } from "@/components/primitives/Icon";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const NAV: ReadonlyArray<{ href: string; label: string; matchPrefix?: string }> = [
  { href: "/", label: "ダッシュボード" },
  { href: "/search", label: "探索", matchPrefix: "/search" },
  { href: "/watchlist", label: "監視リスト" },
  { href: "/dictionary", label: "辞書" },
];

interface AppHeaderProps {
  userInitials?: string;
}

export function AppHeader({ userInitials = "YS" }: AppHeaderProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const isActive = (href: string, prefix?: string): boolean => {
    if (prefix) return pathname.startsWith(prefix);
    return pathname === href;
  };

  async function handleSignOut() {
    const supabase = getBrowserSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="brand">
        <span className="mark">APDE</span>
        <span className="sep">/</span>
        <span className="name">Discovery Engine</span>
      </div>
      <nav>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href, item.matchPrefix) ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="right">
        <button className="iconbtn" type="button" title="検索" aria-label="検索">
          <SearchIcon />
        </button>
        <button className="iconbtn" type="button" title="通知" aria-label="通知">
          <BellIcon />
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          className="avatar"
          title="サインアウト"
          aria-label="サインアウト"
        >
          {userInitials}
        </button>
      </div>
    </header>
  );
}
