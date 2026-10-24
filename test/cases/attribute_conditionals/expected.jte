<script @if(a) src="x" @else src="y" @endif></script>
<style
  @if(a) media="screen" @elseif(b) media="print" @else disabled @endif
></style>
<div @if(a) class="x" @else class="y" @endif></div>
