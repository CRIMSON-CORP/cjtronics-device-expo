const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAutoStart(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    
    // Inject required background and overlay permissions
    const requiredPermissions = [
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.SYSTEM_ALERT_WINDOW'
    ];
    
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    requiredPermissions.forEach(permission => {
      if (!manifest['uses-permission'].some(p => p.$['android:name'] === permission)) {
        manifest['uses-permission'].push({ $: { 'android:name': permission } });
      }
    });

    // Inject the Broadcast Receiver
    const mainApplication = manifest.application[0];
    mainApplication.receiver = mainApplication.receiver || [];
    
    mainApplication.receiver.push({
      $: {
        'android:name': '.BootReceiver',
        'android:enabled': 'true',
        'android:exported': 'true', // The crucial flag for the new SDK
      },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }]
      }]
    });

    return config;
  });
};