<!-- license -->
<%-- template header --%>
@import com.example.Alpha
@import org.example.Zebra

<%-- Parameters --%>
@param String title
<!-- Visibility flag -->
@param boolean visible

<!-- Initial state -->
<%-- setup --%>
!{var heading = title;}

<!-- Body -->
<h1>${heading}</h1>
