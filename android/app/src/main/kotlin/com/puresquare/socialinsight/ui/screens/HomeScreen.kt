package com.puresquare.socialinsight.ui.screens

import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.puresquare.socialinsight.data.SupabaseApi
import com.puresquare.socialinsight.sync.SyncWorker

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    avatars: List<SupabaseApi.Avatar>,
    onAddAvatar: (String) -> Unit,
    onOpenAvatar: (SupabaseApi.Avatar) -> Unit,
) {
    var showAddDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current

    // Many OEMs (seen firsthand on Nubia devices with this project) kill WorkManager's periodic
    // background sync outright unless the app is explicitly exempted from battery optimization —
    // jobs pile up server-side, unclaimed, until the app happens to be reopened manually. This is
    // the one piece of that problem an app can actually fix in code; OEM-specific "autostart" /
    // "protected apps" lists (a separate, non-standard restriction layer on top of stock Android)
    // have no common API and still need to be enabled by hand per device.
    val powerManager = context.getSystemService(PowerManager::class.java)
    var isIgnoringBatteryOptimizations by remember {
        mutableStateOf(powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: true)
    }
    val batteryExemptionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) {
        isIgnoringBatteryOptimizations = powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: true
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Social Analytics") },
                actions = {
                    IconButton(onClick = {
                        SyncWorker.triggerNow(context)
                        Toast.makeText(context, "Sync started — check back in a moment", Toast.LENGTH_SHORT).show()
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Sync now")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                text = { Text("Add avatar") },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                onClick = { showAddDialog = true },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (!isIgnoringBatteryOptimizations) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(16.dp, 16.dp, 16.dp, 0.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            "Background sync may be unreliable",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "This phone's battery saver can stop automatic syncing. Allow this app to run in the background so it keeps fetching data without you having to open it.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = {
                            val intent = Intent(
                                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                Uri.parse("package:${context.packageName}"),
                            )
                            batteryExemptionLauncher.launch(intent)
                        }) {
                            Text("Allow background sync")
                        }
                    }
                }
            }

            if (avatars.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "No avatars on this device yet.\nTap \"Add avatar\" to create one.",
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(avatars, key = { it.id }) { avatar ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onOpenAvatar(avatar) },
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(avatar.name, style = MaterialTheme.typography.titleMedium)
                            avatar.handle?.let {
                                Text("@$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
    }

    if (showAddDialog) {
        AddAvatarDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { name ->
                onAddAvatar(name)
                showAddDialog = false
            },
        )
    }
}

@Composable
private fun AddAvatarDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var nickname by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add avatar") },
        text = {
            Column {
                Text(
                    "Give this avatar a nickname — you'll pick which social accounts belong to it next.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = nickname,
                    onValueChange = { nickname = it },
                    label = { Text("Nickname") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(nickname.trim()) },
                enabled = nickname.trim().isNotEmpty(),
            ) { Text("Continue") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
