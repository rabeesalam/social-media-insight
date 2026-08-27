package com.puresquare.socialinsight.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.puresquare.socialinsight.AppViewModel
import com.puresquare.socialinsight.ConnectAccountsUiState
import com.puresquare.socialinsight.data.SupabaseApi
import com.puresquare.socialinsight.oauth.OAuthLauncher
import com.puresquare.socialinsight.platforms.Platform
import com.puresquare.socialinsight.platforms.PlatformOAuthRegistry

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectAccountsScreen(
    state: ConnectAccountsUiState,
    viewModel: AppViewModel,
    onBack: () -> Unit,
) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.avatarName) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            state.lastError?.let {
                Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        it,
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(Platform.entries.toList(), key = { it.id }) { platform ->
                    val connection = state.connections[platform]
                    val config = PlatformOAuthRegistry.configs.getValue(platform)
                    val busy = state.busyPlatform == platform

                    ListItem(
                        headlineContent = { Text(platform.displayName) },
                        supportingContent = {
                            Text(
                                statusLabel(connection, config.isConfigured),
                                color = statusColor(connection, config.isConfigured),
                            )
                        },
                        trailingContent = {
                            when {
                                busy -> CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                connection?.status == "connected" -> TextButton(onClick = { /* TODO: disconnect */ }) {
                                    Text("Connected")
                                }
                                else -> Button(
                                    enabled = config.isConfigured,
                                    onClick = {
                                        viewModel.startConnect(platform) { cfg, avatarId ->
                                            OAuthLauncher.launch(context, cfg, avatarId)
                                        }
                                    },
                                ) { Text("Connect") }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

private fun statusLabel(connection: SupabaseApi.PlatformConnection?, configured: Boolean): String = when {
    !configured -> "Not configured"
    connection == null -> "Not connected"
    connection.status == "connected" -> "Connected" + (connection.username?.let { " · @$it" } ?: "")
    connection.status == "reauthorization_required" -> "Needs reauthorization"
    connection.status == "error" -> connection.last_error ?: "Error"
    else -> connection.status
}

@Composable
private fun statusColor(connection: SupabaseApi.PlatformConnection?, configured: Boolean): Color = when {
    !configured -> MaterialTheme.colorScheme.onSurfaceVariant
    connection?.status == "connected" -> Color(0xFF2E7D32)
    connection?.status == "reauthorization_required" -> Color(0xFFF9A825)
    connection?.status == "error" -> MaterialTheme.colorScheme.error
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}
