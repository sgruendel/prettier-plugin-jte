<script data-x="it's" src="a.js">
  const x = `${clientOnly}`;
</script>
<script data-x='a"b' src="a.js">
  const x = `${clientOnly}`;
</script>
<style data-x="it's">
  /* ${clientOnly} */
  .item {
    color: red;
  }
</style>
<div title="it's"></div>
<div title="it's&quot;quoted"></div>
<div title="it's&quot;quoted"></div>
<div title="it&#39;s"></div>
<div title="${name}'s"></div>
<div title="prefix@if(a) it's @else theirs @endif"></div>
