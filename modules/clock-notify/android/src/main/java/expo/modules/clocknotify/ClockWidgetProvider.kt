package expo.modules.clocknotify

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

// Three picker entries share this provider; each subclass only names its layout.
open class ClockWidgetProvider : AppWidgetProvider() {
  open fun layout(): Int = R.layout.clock_widget

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    val views = RemoteViews(context.packageName, layout())
    appWidgetIds.forEach { appWidgetManager.updateAppWidget(it, views) }
  }
}

class ClockBareWidgetProvider : ClockWidgetProvider() {
  override fun layout() = R.layout.clock_bare
}

class ClockRowWidgetProvider : ClockWidgetProvider() {
  override fun layout() = R.layout.clock_row
}
