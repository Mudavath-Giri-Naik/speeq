import { defineTool } from "speeq/server";
import { z } from "zod";
import { getQuickStats } from "../stats";

/** Live adoption numbers, the same ones the Adoption page shows. */
export const adoptionStats = defineTool({
  name: "get_adoption_stats",
  description:
    "Get live adoption numbers for speeq: npm installs (last week, last month, all time), GitHub stars and forks, and the latest published version.",
  input: z.object({}),
  async handler() {
    const s = await getQuickStats();
    // npm reports nothing for brand-new packages for a while. Say that, instead of "0 installs".
    const noInstallData = !s.week && !s.month && !s.allTime;
    return {
      latestVersion: s.version,
      installsLastWeek: noInstallData ? null : s.week,
      installsLastMonth: noInstallData ? null : s.month,
      installsAllTime: noInstallData ? null : s.allTime,
      githubStars: s.stars,
      githubForks: s.forks,
      note: noInstallData
        ? "npm has not published download counts for these new packages yet. They usually appear within a day or two. Do not say the count is zero."
        : "npm counts update about once a day and include automated installs.",
    };
  },
});
