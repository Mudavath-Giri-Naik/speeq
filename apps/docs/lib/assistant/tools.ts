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
    return {
      latestVersion: s.version,
      installsLastWeek: s.week,
      installsLastMonth: s.month,
      installsAllTime: s.allTime,
      githubStars: s.stars,
      githubForks: s.forks,
      note: "npm counts update about once a day and include automated installs.",
    };
  },
});
