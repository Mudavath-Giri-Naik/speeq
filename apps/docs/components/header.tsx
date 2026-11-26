import { buildMenu } from "../lib/menu";
import { formatCount, getGithubStars } from "../lib/stats";
import { HeaderBar } from "./nav/header-bar";

/** The top bar. The data is read on the server, and the bar itself runs in the browser. */
export async function Header() {
  const stars = await getGithubStars();
  return (
    <HeaderBar groups={buildMenu()} stars={stars === null ? null : formatCount(stars, true)} />
  );
}
