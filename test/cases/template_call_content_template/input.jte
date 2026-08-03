@template.basecoat.sidebar( id="dashboard-sidebar",
  label = "Dashboard navigation",
  mainAttrs = Map.of("class", "scrollbar"),
  headerAttrs = Map.of("class", "border-b"),
  header = @` <a href="#" class="btn h-12 w-full justify-start px-2" data-variant="ghost" data-size="lg">
      @template.lucide.circleStar() @template.lucide.circleStar() <span>Acme Inc.</span>
    </a> `,
  content = @`
    @template.examples.adminDashboard.components.navMain() @template.examples.adminDashboard.components.navDocuments()
    @template.examples.adminDashboard.components.navSecondary()
  `,
footer = @`@template.examples.adminDashboard.components.navUser(user = user)`
)
