import { describe, expect, it } from "vitest";
import { pl } from "@/lib/i18n/pl";

describe("pl strings", () => {
  it("groups strings by screen", () => {
    expect(Object.keys(pl).sort()).toEqual(
      ["chat", "dialog", "errors", "firstMessage", "form", "panel", "processing", "validation"].sort(),
    );
  });

  describe("form (PRD §9.1)", () => {
    it("has the title, placeholders, reason labels and submit text", () => {
      expect(pl.form.title).toBe("Zwrot lub reklamacja sprzętu");
      expect(pl.form.intro).toMatch(/wstępn\p{L}* decyzj/u);
      expect(pl.form.categoryPlaceholder).toBe("Wybierz kategorię");
      expect(pl.form.modelPlaceholder).toBe("np. Samsung Galaxy S24");
      expect(pl.form.reasonLabel.COMPLAINT).toBe("Opis problemu");
      expect(pl.form.reasonLabel.RETURN).toBe("Powód zwrotu (opcjonalnie)");
      expect(pl.form.chooseFile).toBe("Wybierz plik");
      expect(pl.form.removeFile).toBe("Usuń");
      expect(pl.form.submit).toBe("Wyślij zgłoszenie");
    });

    it("has non-empty labels for every field", () => {
      for (const label of Object.values(pl.form.labels)) expect(label.trim()).not.toBe("");
      expect(Object.keys(pl.form.labels).sort()).toEqual(
        ["caseType", "category", "modelName", "photo", "purchaseDate"].sort(),
      );
    });

    it("has a neutral reason label for when no case type is chosen yet", () => {
      expect(pl.form.reasonLabelDefault).toBe("Opis zgłoszenia");
    });

    it("has the photo hints per case type", () => {
      expect(pl.form.photoHint.RETURN).toBe(
        "Zrób zdjęcie całego urządzenia, aby było widać, że nie jest uszkodzone ani używane.",
      );
      expect(pl.form.photoHint.COMPLAINT).toBe("Zrób zdjęcie, na którym wyraźnie widać uszkodzenie lub usterkę.");
    });
  });

  it("maps every validation error code (AC-03, AC-04, AC-07, AC-08, AC-09)", () => {
    expect(pl.validation).toEqual({
      REQUIRED: "To pole jest wymagane",
      TOO_SHORT: "Opisz problem (min. 20 znaków)",
      TOO_LONG: "Przekroczono maksymalną liczbę znaków",
      FUTURE_DATE: "Data zakupu nie może być z przyszłości",
      UNSUPPORTED_FORMAT: "Dozwolone formaty: JPG, PNG, WebP",
      FILE_TOO_LARGE: "Plik przekracza limit 10 MB",
      INVALID_ENUM: "Wybierz wartość z listy",
      MULTIPLE_FILES: "Dodaj tylko jedno zdjęcie",
    });
  });

  it("has the processing stages (PRD §9.1)", () => {
    expect(pl.processing.analyzingImage).toBe("Analizujemy zdjęcie…");
    expect(pl.processing.preparingDecision).toBe("Przygotowujemy decyzję…");
  });

  it("has the error texts (AC-34, PRD §4.6)", () => {
    expect(pl.errors.processingBanner).toBe("Nie udało się przetworzyć zgłoszenia. Spróbuj ponownie za chwilę.");
    expect(pl.errors.sessionExpired).toBe("Sesja wygasła. Rozpocznij nowe zgłoszenie.");
    expect(pl.errors.chatFailed).toBe("Nie udało się wysłać wiadomości.");
    expect(pl.errors.retry).toBe("Ponów");
  });

  it("has the chat texts (AC-30, AC-33)", () => {
    expect(pl.chat.send).toBe("Wyślij");
    expect(pl.chat.inputPlaceholder.trim()).not.toBe("");
    expect(pl.chat.limitReached).toBe(
      "Osiągnięto limit wiadomości w tym zgłoszeniu. Rozpocznij nowe zgłoszenie lub skontaktuj się ze sklepem, podając numer sprawy.",
    );
    expect(pl.chat.updatedDecisionTitle).toBe("Zaktualizowana decyzja");
    expect(pl.chat.updatingDecision).toBe("Aktualizuję decyzję…");
    expect(pl.chat.newCase).toBe("Nowe zgłoszenie");
  });

  it("has the new-case dialog texts (PRD §4.7)", () => {
    expect(pl.dialog).toEqual({
      newCaseMessage: "Bieżąca rozmowa zostanie zamknięta. Kontynuować?",
      confirm: "Kontynuuj",
      cancel: "Anuluj",
    });
  });

  it("has the case summary panel labels (PRD §9.2)", () => {
    expect(pl.panel).toEqual({
      caseId: "Numer sprawy",
      caseType: "Typ zgłoszenia",
      category: "Kategoria",
      model: "Model",
      purchaseDate: "Data zakupu",
      reason: "Opis",
      showMore: "Pokaż więcej",
      showLess: "Pokaż mniej",
      status: "Status",
    });
  });

  it("has the first-message parts and the mandatory disclaimer (AC-24, §11.6, §11.8)", () => {
    expect(pl.firstMessage.greeting).toBe("Dzień dobry!");
    expect(pl.firstMessage.headings).toEqual({
      decision: "Decyzja",
      justification: "Uzasadnienie",
      nextSteps: "Następne kroki",
      questions: "Pytania",
    });
    expect(pl.firstMessage.caseIdPrefix).toBe("Numer sprawy:");
    expect(pl.firstMessage.disclaimer).toBe(
      "Ta decyzja jest wstępna i nie jest wiążąca. Ostateczną decyzję podejmuje sklep po fizycznym sprawdzeniu urządzenia. Nie ogranicza to Twoich ustawowych praw konsumenta.",
    );
  });
});
