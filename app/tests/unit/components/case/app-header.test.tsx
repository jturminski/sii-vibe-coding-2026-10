import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppHeader } from "@/components/case/app-header";
import { pl } from "@/lib/i18n/pl";

afterEach(cleanup);

describe("AppHeader (PRD §9.1 header)", () => {
  it("renders the Code10 logo and the Polish title", () => {
    render(<AppHeader />);

    const banner = screen.getByRole("banner");
    const logo = screen.getByRole("img", { name: "Code10" });
    expect(banner).toContainElement(logo);
    expect(logo.getAttribute("src")).toContain("logo.png");
    expect(screen.getByRole("heading", { level: 1, name: pl.form.title })).toBeInTheDocument();
  });

  it("renders the children of the actions slot", () => {
    render(<AppHeader actions={<button type="button">Akcja testowa</button>} />);

    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("button", { name: "Akcja testowa" }),
    );
  });

  it("renders no actions container when no actions are given", () => {
    render(<AppHeader />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
