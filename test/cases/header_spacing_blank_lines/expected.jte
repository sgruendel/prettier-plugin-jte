<%-- license --%>

<%-- template header --%>

@import org.example.Alpha
@import org.example.Zebra

<%-- Parameters --%>

@param String title

@param boolean visible
@param int count

<%-- setup --%>

!{var heading = title;}

!{var visibleCount = count;}

<h1>${heading}</h1>
