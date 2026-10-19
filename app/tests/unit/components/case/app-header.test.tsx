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

  it("moves the title to its own full-width row below md when actions are present (QA D2)", () => {
    render(<AppHeader actions={<button type="button">Akcja testowa</button>} />);

    const title = screen.getByRole("heading", { level: 1 });
    // Narrow screens: the title is pushed after the actions onto a full row, so the
    // action button can never squeeze it; from md the title sits inline again.
    expect(title).toHaveClass("order-last", "basis-full", "md:order-none", "md:flex-1");
    const actions = screen.getByRole("button", { name: "Akcja testowa" }).parentElement;
    expect(actions).toHaveClass("ml-auto", "shrink-0");
  });

  it("aligns its content container with the chat grid width (QA O3)", () => {
    render(<AppHeader />);

    const container = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(container).toHaveClass("max-w-6xl", "px-4", "sm:px-6");
  });

  it("renders no actions container when no actions are given", () => {
    render(<AppHeader />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
