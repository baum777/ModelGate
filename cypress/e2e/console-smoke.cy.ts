describe("MosaicStacked console smoke", () => {
  it("loads the console shell", () => {
    cy.visit("/console");
    cy.get('[data-testid="app-shell"]').should("be.visible");
  });
});
