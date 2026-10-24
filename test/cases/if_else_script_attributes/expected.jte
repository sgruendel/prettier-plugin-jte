<head>
  @if(debug)
    <script src="/assets/live.js"></script>
  @else
    <link rel="stylesheet" href="${assetPath("/assets/site.css")}" />
    <script src="${assetPath("/assets/site.js")}"></script>
  @endif
</head>
