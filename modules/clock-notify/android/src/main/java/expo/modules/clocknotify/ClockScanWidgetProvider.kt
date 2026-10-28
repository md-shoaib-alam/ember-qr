package expo.modules.clocknotify

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

// One tap on the card opens the app straight on the camera tab.
class ClockScanWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    val views = RemoteViews(context.packageName, R.layout.clock_scan)
    views.setOnClickPendingIntent(R.id.scan_widget, scanIntent(context))
    appWidgetIds.forEach { appWidgetManager.updateAppWidget(it, views) }
  }

  // Keep the launcher intent's target activity, but hand it a deep link: expo-linking only
  // reports the URL when the intent is an ACTION_VIEW carrying the scheme.
  private fun scanIntent(context: Context): PendingIntent {
    val launcher = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val intent = (launcher ?: Intent(Intent.ACTION_VIEW)).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("emberqr://scan")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return PendingIntent.getActivity(
      context,
      1,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
