<script <%-- a > b --%> src="x.js"></script>
<script !{var x = a > b;} src="x.js"></script>
<script data-x="@`<b>x</b>`" src="x.js"></script>
<script @template.attrs(a -> b) src="x.js"></script>
<style <%-- a > b --%> media="screen"></style>
<style data-x="@`<b>x</b>`"></style>
