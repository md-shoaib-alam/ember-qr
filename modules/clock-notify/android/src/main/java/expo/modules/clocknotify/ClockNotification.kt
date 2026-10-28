package expo.modules.clocknotify

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object ClockNotification {
  private const val CHANNEL_ID = "clock"
  private const val NOTIFICATION_ID = 1001
  private const val PREFS = "ember.clock"
  private const val KEY_ENABLED = "enabled"

  fun isEnabled(context: Context): Boolean =
    prefs(context).getBoolean(KEY_ENABLED, false) && allowed(context)

  // Settings can revoke the channel or the permission long after the switch was turned on.
  private fun allowed(context: Context): Boolean {
    if (!manager(context).areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
    return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
  }

  fun start(context: Context) {
    if (!allowed(context)) {
      throw IllegalStateException("Notifications are turned off for Ember QR in system settings.")
    }
    ensureChannel(context)
    manager(context).notify(NOTIFICATION_ID, build(context))
    prefs(context).edit().putBoolean(KEY_ENABLED, true).apply()
  }

  fun stop(context: Context) {
    manager(context).cancel(NOTIFICATION_ID)
    prefs(context).edit().putBoolean(KEY_ENABLED, false).apply()
  }

  // The notification survives the process, not a reboot, so the boot receiver puts it back.
  fun restore(context: Context) {
    if (!isEnabled(context)) return
    ensureChannel(context)
    manager(context).notify(NOTIFICATION_ID, build(context))
  }

  private fun build(context: Context): Notification {
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)
      }

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val content =
      launch?.let {
        PendingIntent.getActivity(
          context,
          0,
          it,
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
      }

    val tiles = ClockViews.forNotification(context)

    return builder
      .setSmallIcon(R.drawable.ic_stat_clock)
      .setStyle(Notification.DecoratedCustomViewStyle())
      .setCustomContentView(tiles)
      .setCustomBigContentView(tiles)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setContentIntent(content)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setColor(context.getColor(R.color.clock_accent))
      .build()
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = manager(context)
    if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(CHANNEL_ID, "Live clock", NotificationManager.IMPORTANCE_LOW).apply {
        description = "The clock pinned to the notification shade."
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
      }
    mgr.createNotificationChannel(channel)
  }

  private fun manager(context: Context): NotificationManager =
    context.getSystemService(NotificationManager::class.java)

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
