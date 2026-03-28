<body>
@if( entries.isEmpty() )
<h1>None</h1>
@elseif(entries.size() == 1)
<h2>One</h2>
@else
<h3>${ entries.size() }</h3>
@endif
</body>
