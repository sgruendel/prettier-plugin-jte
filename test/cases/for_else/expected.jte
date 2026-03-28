<ul>
  @for(var item : items)
    <li>${item.getName()}</li>
  @else
    <li>Empty</li>
  @endfor
</ul>
