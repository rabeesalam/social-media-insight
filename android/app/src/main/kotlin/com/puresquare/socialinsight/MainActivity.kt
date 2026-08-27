package com.puresquare.socialinsight

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.puresquare.socialinsight.data.SupabaseApi
import com.puresquare.socialinsight.ui.screens.ConnectAccountsScreen
import com.puresquare.socialinsight.ui.screens.HomeScreen
import com.puresquare.socialinsight.ui.theme.SocialInsightTheme

class MainActivity : ComponentActivity() {

    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)

        setContent {
            SocialInsightTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    AppRoot(viewModel)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
        if (uri.scheme == "com.puresquare.socialinsight" && uri.host == "oauth-callback") {
            viewModel.handleOAuthRedirect(uri)
        }
    }
}

@Composable
private fun AppRoot(viewModel: AppViewModel) {
    val registrationState by viewModel.registrationState.collectAsState()
    val avatars by viewModel.avatars.collectAsState()
    val connectState by viewModel.connectState.collectAsState()

    when (val state = registrationState) {
        is RegistrationState.Loading -> LoadingScreen("Setting up this device…")
        is RegistrationState.Failed -> ErrorScreen(state.message) { viewModel.retryRegistration() }
        is RegistrationState.Ready -> {
            val active = connectState
            if (active != null) {
                ConnectAccountsScreen(
                    state = active,
                    viewModel = viewModel,
                    onBack = { viewModel.closeConnectAccounts() },
                )
            } else {
                HomeScreen(
                    avatars = avatars,
                    onAddAvatar = { name ->
                        viewModel.addAvatar(name) { }
                    },
                    onOpenAvatar = { avatar: SupabaseApi.Avatar ->
                        viewModel.openConnectAccounts(avatar.id, avatar.name)
                    },
                )
            }
        }
    }
}

@Composable
private fun LoadingScreen(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(Modifier.height(16.dp))
            Text(message)
        }
    }
}

@Composable
private fun ErrorScreen(message: String, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(message, textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry) { Text("Retry") }
        }
    }
}
