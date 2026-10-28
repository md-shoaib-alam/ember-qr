package expo.modules.clocknotify

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ClockNotifyModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext) { "ClockNotify needs a React context" }

  override fun definition() = ModuleDefinition {
    Name("ClockNotify")

    AsyncFunction("isRunning") {
      ClockNotification.isEnabled(context)
    }

    AsyncFunction("start") {
      ClockNotification.start(context)
    }

    AsyncFunction("stop") {
      ClockNotification.stop(context)
    }

    AsyncFunction("restore") {
      ClockNotification.restore(context)
    }
  }
}
