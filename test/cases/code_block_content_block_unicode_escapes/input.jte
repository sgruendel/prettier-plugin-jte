!{var text=\u0022@`<b class = 'raw'>=</b>`\u0022;}
!{var text=\u0022// @`<b class = 'raw'>=</b>`\u0022;}
!{var text=\u0022@`unterminated\u0022;}
!{var text=\u0022} // @`unterminated\u0022;}
!{// @`unterminated } \u000a var text=\u0022raw\u0022;}
!{// @`unterminated } \u000d var text=\u0022raw\u0022;}
!{\u002f\u002a @`unterminated } \u002a\u002f var next=1;}
!{var literal="\\u0022"; var text=\u0022// @`unterminated\u0022;}
!{var text=\u0022\u005c\u0022// @`unterminated\u0022;}
!{var repeated=\uu0022@`<b class = 'raw'>=</b>`\uuu0022;}
!{\u002f\u002a @`<b class = "raw">=</b>` \u002a\u002f var next=1;}
!{
  \u002f\u002f @`<b class = "raw">=</b>`
  var next=1;
}
!{var text="\u0041"; var content=@`<b class = "raw">=</b>`;}
!{var content=@`<b class = "formatted">${ value }</b>`;}
