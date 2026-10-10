import { Segmented } from "@/components/ui/segmented";

/** People & access: members, guests with a code and pending invites share one section. */
export function PeopleTabs({ active }: { active: "members" | "guests" | "pending" }) {
  return <Segmented label="People & access" options={[
    { label: "Members", href: "/admin/users", active: active === "members" },
    { label: "Guests with a code", href: "/admin/codes", active: active === "guests" },
    { label: "Pending invites", href: "/admin/users?status=pending", active: active === "pending" },
  ]} />;
}
