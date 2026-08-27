package com.puresquare.socialinsight.ui.screens

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
        if (avatars.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
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
                modifier = Modifier.fillMaxSize().padding(padding),
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
