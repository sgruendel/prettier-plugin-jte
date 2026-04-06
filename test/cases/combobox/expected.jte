@import java.util.Map

<section id="combobox" class="w-full rounded-lg border scroll-mt-14">
  <header class="border-b px-4 py-3 flex items-center justify-between">
    <h2 class="text-sm font-medium">Combobox</h2>
    <a
      href="https://basecoatui.com/components/combobox"
      class="text-muted-foreground hover:text-foreground"
      data-tooltip="See documentation"
      data-side="left"
    >
      @template.lucide.bookOpen(attrs = Map.of("class", "size-4"))
    </a>
  </header>
  <div class="p-4">
    <div class="flex flex-wrap items-start gap-4">
      @template.basecoat.select(
        id = "demo-combobox-frameworks",
        popoverAttrs = Map.of("class", "w-48"),
        listboxAttrs = Map.of("data-empty", "No framework found."),
        isCombobox = true,
        options = @`
          <div role="option" data-value="Next.js">Next.js</div>
          <div role="option" data-value="SvelteKit">SvelteKit</div>
          <div role="option" data-value="Nuxt.js">Nuxt.js</div>
          <div role="option" data-value="Remix">Remix</div>
          <div role="option" data-value="Astro">Astro</div>
        `
      )

      @template.basecoat.select(
        id = "demo-combobox-timezones",
        popoverAttrs = Map.of("class", "w-72"),
        listboxAttrs = Map.of("data-empty", "No timezone found."),
        isCombobox = true,
        options = @`
          <div class="max-h-64 overflow-y-auto scrollbar">
            <div role="group" aria-labelledby="demo-combobox-timezones-group-0">
              <span id="demo-combobox-timezones-group-0" role="heading">Americas</span>
              <div role="option" data-value="America/New_York">(GMT-5) New York</div>
              <div role="option" data-value="America/Los_Angeles">(GMT-8) Los Angeles</div>
              <div role="option" data-value="America/Chicago">(GMT-6) Chicago</div>
              <div role="option" data-value="America/Toronto">(GMT-5) Toronto</div>
              <div role="option" data-value="America/Vancouver">(GMT-8) Vancouver</div>
              <div role="option" data-value="America/Sao_Paulo">(GMT-3) Sao Paulo</div>
            </div>
            <div role="group" aria-labelledby="demo-combobox-timezones-group-1">
              <span id="demo-combobox-timezones-group-1" role="heading">Europe</span>
              <div role="option" data-value="Europe/London">(GMT+0) London</div>
              <div role="option" data-value="Europe/Paris">(GMT+1) Paris</div>
              <div role="option" data-value="Europe/Berlin">(GMT+1) Berlin</div>
              <div role="option" data-value="Europe/Rome">(GMT+1) Rome</div>
              <div role="option" data-value="Europe/Madrid">(GMT+1) Madrid</div>
              <div role="option" data-value="Europe/Amsterdam">(GMT+1) Amsterdam</div>
            </div>
            <div role="group" aria-labelledby="demo-combobox-timezones-group-2">
              <span id="demo-combobox-timezones-group-2" role="heading">Asia/Pacific</span>
              <div role="option" data-value="Asia/Tokyo">(GMT+9) Tokyo</div>
              <div role="option" data-value="Asia/Shanghai">(GMT+8) Shanghai</div>
              <div role="option" data-value="Asia/Singapore">(GMT+8) Singapore</div>
              <div role="option" data-value="Asia/Dubai">(GMT+4) Dubai</div>
              <div role="option" data-value="Australia/Sydney">(GMT+11) Sydney</div>
              <div role="option" data-value="Asia/Seoul">(GMT+9) Seoul</div>
            </div>
          </div>
          <hr role="separator">
          <div role="option">
            @template.lucide.circlePlus()
            Create timezone
          </div>
        `
      )
    </div>
  </div>
</section>
