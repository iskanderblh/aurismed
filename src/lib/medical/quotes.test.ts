import { describe, expect, it } from "vitest";
import { quoteContext } from "./quotes";

const T = "Docteur : Vous avez de la fièvre ? Patient : Oui, j’ai eu 38,5 ce matin. Pas de vomissements.";

describe("quoteContext", () => {
  it("retrouve une citation exacte", () => {
    const c = quoteContext(T, "j’ai eu 38,5 ce matin")!;
    expect(c.match).toBe("j’ai eu 38,5 ce matin");
  });
  it("tolère accents, casse et ponctuation", () => {
    const c = quoteContext(T, "vous avez de la FIEVRE")!;
    expect(c.match).toBe("Vous avez de la fièvre");
    expect(c.before.endsWith("Docteur : ")).toBe(true);
  });
  it("renvoie null si la citation est absente", () => {
    expect(quoteContext(T, "douleur thoracique")).toBeNull();
  });
});
