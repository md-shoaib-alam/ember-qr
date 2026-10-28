package expo.modules.clocknotify

import android.content.Context
import android.widget.RemoteViews

object ClockViews {
  // A notification already sits inside SystemUI's own card, so the shade gets the tiles bare.
  fun forNotification(context: Context): RemoteViews =
    RemoteViews(context.packageName, R.layout.clock_tiles)
}
