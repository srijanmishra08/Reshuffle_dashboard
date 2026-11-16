import { describe, expect, it } from "vitest";
import { instalmentTotal, longDate, offerLetterText, serviceAgreementText } from "../letter-templates";

describe("letter templates", () => {
  it("formats dates and leaves unknown input alone", () => {
    expect(longDate("2026-07-05")).toBe("5 July 2026");
    expect(longDate("soon")).toBe("soon");
  });

  it("builds an offer letter that the PDF lays out as a job offer", () => {
    const t = offerLetterText({
      candidateName: "Test Person",
      position: "Product Manager",
      startDate: "2026-12-01",
      employmentType: "full-time",
      responsibilities: "manage the product roadmap.",
      reportsTo: "Sample Manager",
      monthlyPayRupees: 123456,
    });
    expect(t.subject).toBe("Job Offer: Product Manager");
    expect(t.body).toContain("Dear Test Person,");
    expect(t.body).toContain("starting 1 December 2026");
    expect(t.body).toContain("you will manage the product roadmap, reporting to Sample Manager.");
    expect(t.body).toContain("₹1,23,456");
  });

  it("builds a service agreement with schedule amounts and numbered terms", () => {
    const t = serviceAgreementText({
      providerName: "Example Provider",
      clientName: "Fake Traders",
      projectTitle: "Sample Website",
      description: "Design and build a website.",
      deliverables: "Home page\nContact form",
      exclusions: "",
      startDate: "2026-12-01",
      endDate: "2027-01-15",
      totalFeeRupees: 100000,
      gstExtra: true,
      instalments: [
        { label: "On signing", percent: 50 },
        { label: "On delivery", percent: 50 },
      ],
      revisionRounds: 2,
      ip: "full",
      lateFeePercent: 2,
      cancellationFeePercent: 0,
      jurisdiction: "Raipur, Chhattisgarh",
      extraClauses: "Support. Thirty days of support are included.",
    });
    expect(t.subject).toBe("Service Agreement: Sample Website");
    expect(t.body).toContain("₹1,00,000 plus GST as applicable");
    expect(t.body).toContain("•  On signing: 50% (₹50,000)");
    expect(t.body).toContain("•  Home page\n•  Contact form");
    expect(t.body).not.toContain("Not included");
    expect(t.body).not.toContain("Cancellation.");
    expect(t.body).toContain("5.5  Late Payment.");
    expect(t.body).toContain("5.7  Support. Thirty days of support are included.");
    expect(t.body.length).toBeLessThan(20000);
  });

  it("adds up instalments", () => {
    expect(instalmentTotal([{ label: "a", percent: 50 }, { label: "b", percent: 30 }, { label: "c", percent: 20 }])).toBe(100);
  });
});
