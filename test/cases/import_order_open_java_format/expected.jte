@import static com.example.Helpers.alpha
@import static java.util.Collections.emptyList
@import static javax.swing.SwingConstants.CENTER
@import static org.example.Helpers.zebra

@import com.example.Page
@import java.util.List
@import java.util.Map
@import javafx.scene.Node
@import javax.crypto.Cipher
@import javax.sql.DataSource
@import org.example.Alpha
@import org.example.Zebra

@param Page page

!{var title = page.getTitle();}

<h1>${title}</h1>
