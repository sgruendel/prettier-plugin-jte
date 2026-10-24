<section>
  !{
    var literal = "@`<b class = 'raw'>=</b>`";
    var text = """
        @`<b class = 'raw'>=</b>`
        """;
    // @` ignored }
    /* @` ignored } */
    final var first = @`
      <div data-kind="first">
        @if(enabled)
          <p>don't balance } here</p>
        @endif
      </div>
    `;
    final var second = @`<span title="next">${value}</span>`;
    var after = 1;
  }
</section>
