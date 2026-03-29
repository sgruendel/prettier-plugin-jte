<div id="${id}" class="select">
  <button
    type="button"
    class="btn-outline ${btnClassAppend}"
    id="${id}-trigger"
    aria-haspopup="listbox"
    aria-expanded="false"
    aria-controls="${id}-listbox"
  >
    <span class="truncate"></span>

    @template.lucide.chevronsUpDown( classAppend = "text-muted-foreground opacity-50 shrink-0", size = 16, strokeWidth = 2 )
  </button>
</div>