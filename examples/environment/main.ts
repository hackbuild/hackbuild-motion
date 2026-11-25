// Fold only page: the package has no live stage here, so the page is its
// how this works fold, rendered from packages/environment/how.ts.
import { mountHow } from "../shared/how.js";
import { check, finish, result } from "../shared/ui.js";
import how from "../../packages/environment/how";

const r = result("environment");
const fold = mountHow(how);
if (fold) fold.open = true;
check(r, "environment: the how this works fold", fold ? "pass" : "fail");
finish(r, fold ? "pass" : "fail", fold ? "" : "the fold did not render");
