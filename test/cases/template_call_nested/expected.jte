<section>
  @template.basecoat.select(
    id = "view-selector",
    selected = viewItems.getFirst().value(),
    items = viewItems,
    mainAttrs = Map.of("class", "w-fit lg:hidden"),
    triggerAttrs = Map.of(
      "class", "w-48",
      "aria-labelledby", "view-selector-label view-selector-trigger"
    )
  )

  @template.basecoat.tabs(
    id = "document-tabs",
    tabs = List.of(
      new BasecoatTab(
        "Outline",
        null,
        Map.of("data-view", "outline"),
        @`
          @template.examples.adminDashboard.components.dataTable.outlinePanel(
            pageSizeItems = pageSizeItems
          )
        `,
        Map.of("class", "order-1 mt-6", "data-view", "outline")
      ),
      new BasecoatTab(
        null,
        @`
          Past Performance <span class="badge" data-variant="secondary">3</span>
        `,
        Map.of("data-view", "past-performance"),
        @`@template.examples.adminDashboard.components.dataTable.emptyPanel()`,
        Map.of("class", "order-1 mt-6", "data-view", "past-performance")
      ),
      new BasecoatTab(
        null,
        @`Key Personnel <span class="badge" data-variant="secondary">2</span>`,
        Map.of("data-view", "key-personnel"),
        @`@template.examples.adminDashboard.components.dataTable.emptyPanel()`,
        Map.of("class", "order-1 mt-6", "data-view", "key-personnel")
      ),
      new BasecoatTab(
        "Focus Documents",
        null,
        Map.of("data-view", "focus-documents"),
        @`@template.examples.adminDashboard.components.dataTable.emptyPanel()`,
        Map.of(
          "class", "order-1 mt-6",
          "data-view", "focus-documents",
          "hx-get", "/examples/admin-dashboard/outlines",
          "hx-trigger", "change",
          "hx-include", "#rows-per-page input",
          "hx-vals", pageSizeValues,
          "hx-target", "#outline-results",
          "hx-swap", "outerHTML"
        )
      )
    ),
    tablistAttrs = Map.of("class", "dashboard-tab-list hidden lg:flex")
  )
</section>
