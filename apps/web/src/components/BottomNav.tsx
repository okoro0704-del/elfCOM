import { NavLink } from "react-router-dom";
import { useChatStore } from "../store/chatStore";
import { useMailStore } from "../store/mailStore";
import { useOmniStore } from "../store/omniStore";
import { IconChat, IconMail, IconOmniChat, IconOmniMail } from "./icons";

const tabs = [
  { to: "/chat", label: "ElfChat", icon: IconChat, badgeKey: "chat" as const },
  { to: "/mail", label: "ElfMail", icon: IconMail, badgeKey: "mail" as const },
  { to: "/omnichat", label: "OmniChat", icon: IconOmniChat, badgeKey: "omnichat" as const },
  { to: "/omnimail", label: "OmniMail", icon: IconOmniMail, badgeKey: "omnimail" as const },
];

export function BottomNav() {
  const chatUnread = useChatStore((s) => s.unreadTotal());
  const mailUnread = useMailStore((s) => s.unreadTotal());
  const omniChatUnread = useOmniStore((s) => s.omniChatUnread());
  const omniMailUnread = useOmniStore((s) => s.omniMailUnread());

  const badges = {
    chat: chatUnread,
    mail: mailUnread,
    omnichat: omniChatUnread,
    omnimail: omniMailUnread,
  };

  return (
    <nav
      className="safe-pb sticky bottom-0 z-40 border-t border-line bg-ink-soft/95 backdrop-blur-md"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4 px-1 pt-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = badges[tab.badgeKey];
          return (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  [
                    "relative flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors",
                    isActive ? "text-accent" : "text-mist hover:text-foam",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon active={isActive} />
                      {count > 0 ? (
                        <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[9px] font-bold leading-4 text-ink">
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : null}
                    </span>
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
