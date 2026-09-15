import { Nav } from "./nav";
import { loadLeague } from "@/lib/data";

/** Resolves league name/week from the cached league fetch; never throws. */
export async function NavServer() {
  try {
    const b = await loadLeague();
    return <Nav leagueName={b.league.leagueName} week={b.currentWeek} />;
  } catch {
    return <Nav />;
  }
}
