@import com.example.Page
@import javafx.scene.Node
@import org.example.Alpha
@import org.example.Zebra

@import javax.crypto.Cipher
@import javax.sql.DataSource
@import java.util.List
@import java.util.Map

@import static com.example.Helpers.alpha
@import static java.util.Collections.emptyList
@import static javax.swing.SwingConstants.CENTER
@import static org.example.Helpers.zebra

@param Page page

!{var title = page.getTitle();}

<h1>${title}</h1>
