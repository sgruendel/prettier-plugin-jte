<%-- license --%>


<%-- template header --%>

@import org.example.Zebra

@import org.example.Alpha
<%-- Parameters --%>

@param String title


@param boolean visible
@param int count

<%-- setup --%>

!{var heading=title;}

!{var visibleCount=count;}
<h1>${heading}</h1>
