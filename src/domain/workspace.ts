export type Section =
  | "dashboard"
  | "compose"
  | "templates"
  | "audience"
  | "activity"
  | "scraper"
  | "preferences";

export const sectionDetails: Record<Section, { title: string; description: string }> = {
  dashboard: { title: "Dashboard", description: "A quick view of your outreach and replies." },
  compose: { title: "Compose email", description: "Create a personal note for your client list." },
  templates: { title: "Email templates", description: "Write once, personalize every message." },
  audience: { title: "Your audience", description: "Manage the people you want to reach." },
  activity: { title: "Sent emails", description: "Keep track of each individual delivery." },
  scraper: { title: "Web scraper", description: "Find pages by keyword and date, then share a link." },
  preferences: { title: "Preferences", description: "Shape how Timeless looks and works for you." },
};
