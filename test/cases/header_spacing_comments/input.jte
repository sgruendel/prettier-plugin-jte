<!-- license -->
<%-- template header --%>
@import org.example.Zebra
@import com.example.Alpha
<%-- Parameters --%>
@param String title
<!-- Visibility flag -->
@param boolean visible
<!-- Initial state -->
<%-- setup --%>
!{var heading=title;}
<!-- Body -->
<h1>${heading}</h1>
