package com.puresquare.socialinsight

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.puresquare.socialinsight.data.DeviceIdentity
import com.puresquare.socialinsight.data.SupabaseApi
import com.puresquare.socialinsight.data.rpcCall
import com.puresquare.socialinsight.oauth.OAUTH_REDIRECT_URI
import com.puresquare.socialinsight.oauth.OAuthLauncher
import com.puresquare.socialinsight.oauth.PendingAuthorization
import com.puresquare.socialinsight.platforms.Platform
import com.puresquare.socialinsight.platforms.PlatformOAuthRegistry
import com.puresquare.socialinsight.sync.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface RegistrationState {
    data object Loading : RegistrationState
    data object Ready : RegistrationState
    data class Failed(val message: String) : RegistrationState
}

data class ConnectAccountsUiState(
    val avatarId: String,
    val avatarName: String,
    val connections: Map<Platform, SupabaseApi.PlatformConnection?> = emptyMap(),
    val busyPlatform: Platform? = null,
    val lastError: String? = null,
)

/**
 * Single Activity-scoped ViewModel — holds device identity + Supabase client for the whole app.
 * Kept deliberately simple (no DI framework) per ADR-0003/§69: this is a small personal-scale app,
 * not a codebase that needs Hilt.
 */
class AppViewModel(application: Application) : AndroidViewModel(application) {

    val identity = DeviceIdentity(application)
    private val api = SupabaseApi()

    private val _registrationState = MutableStateFlow<RegistrationState>(RegistrationState.Loading)
    val registrationState: StateFlow<RegistrationState> = _registrationState.asStateFlow()

    private val _avatars = MutableStateFlow<List<SupabaseApi.Avatar>>(emptyList())
    val avatars: StateFlow<List<SupabaseApi.Avatar>> = _avatars.asStateFlow()

    private val _connectState = MutableStateFlow<ConnectAccountsUiState?>(null)
    val connectState: StateFlow<ConnectAccountsUiState?> = _connectState.asStateFlow()

    private var pendingAuthorization: PendingAuthorization? = null

    init {
        ensureDeviceRegistered()
    }

    private fun ensureDeviceRegistered() {
        viewModelScope.launch(Dispatchers.IO) {
            if (identity.isRegistered) {
                _registrationState.value = RegistrationState.Ready
                SyncWorker.schedule(getApplication())
                refreshAvatars()
                return@launch
            }
            rpcCall { api.registerDevice(identity) }
                .onSuccess {
                    identity.deviceSecret = it.device_secret
                    _registrationState.value = RegistrationState.Ready
                    SyncWorker.schedule(getApplication())
                    refreshAvatars()
                }
                .onFailure { e ->
                    _registrationState.value = RegistrationState.Failed(
                        e.message ?: "Could not register this device."
                    )
                }
        }
    }

    fun retryRegistration() {
        _registrationState.value = RegistrationState.Loading
        ensureDeviceRegistered()
    }

    fun refreshAvatars() {
        viewModelScope.launch(Dispatchers.IO) {
            rpcCall { api.listAvatars(identity) }.onSuccess { _avatars.value = it }
        }
    }

    fun addAvatar(name: String, onDone: (Result<Unit>) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val result = rpcCall { api.upsertAvatar(identity, name) }
            result.onSuccess { refreshAvatars() }
            onDone(result.map {})
        }
    }

    // -----------------------------------------------------------------
    // Connect Accounts screen
    // -----------------------------------------------------------------

    fun openConnectAccounts(avatarId: String, avatarName: String) {
        _connectState.value = ConnectAccountsUiState(avatarId = avatarId, avatarName = avatarName)
        refreshConnections(avatarId)
    }

    fun closeConnectAccounts() {
        _connectState.value = null
        pendingAuthorization = null
    }

    fun refreshConnections(avatarId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            rpcCall { api.listPlatformConnections(identity) }.onSuccess { all ->
                val byPlatform = Platform.entries.associateWith { platform ->
                    all.firstOrNull { it.avatar_id == avatarId && it.platform == platform.id }
                }
                _connectState.value = _connectState.value?.copy(connections = byPlatform)
            }
        }
    }

    /** Called from the UI (needs an Activity Context to launch the Custom Tab). */
    fun startConnect(platform: Platform, launch: (com.puresquare.socialinsight.platforms.PlatformOAuthConfig, String) -> PendingAuthorization) {
        val state = _connectState.value ?: return
        val config = PlatformOAuthRegistry.configs.getValue(platform)
        if (!config.isConfigured) {
            _connectState.value = state.copy(
                lastError = "${platform.displayName} isn't configured yet — add its client ID to local.properties."
            )
            return
        }
        pendingAuthorization = launch(config, state.avatarId)
        _connectState.value = state.copy(busyPlatform = platform, lastError = null)
    }

    /** Called from MainActivity when the oauth-callback deep link intent arrives. */
    fun handleOAuthRedirect(uri: android.net.Uri) {
        val pending = pendingAuthorization ?: return
        val returnedState = uri.getQueryParameter("state")
        val code = uri.getQueryParameter("code")
        val error = uri.getQueryParameter("error")
        val current = _connectState.value ?: return

        if (error != null) {
            _connectState.value = current.copy(busyPlatform = null, lastError = "Authorization was denied or cancelled.")
            pendingAuthorization = null
            return
        }
        if (returnedState != pending.state || code == null) {
            _connectState.value = current.copy(busyPlatform = null, lastError = "Authorization response didn't match the request — please try again.")
            pendingAuthorization = null
            return
        }

        viewModelScope.launch(Dispatchers.IO) {
            val result = rpcCall {
                api.exchangeOAuthCode(
                    identity = identity,
                    avatarId = pending.avatarId,
                    platform = pending.platform,
                    code = code,
                    codeVerifier = pending.codeVerifier,
                    redirectUri = OAUTH_REDIRECT_URI,
                )
            }
            pendingAuthorization = null
            result.onSuccess { exchangeResult ->
                if (exchangeResult.status == "connected") {
                    refreshConnections(pending.avatarId)
                } else {
                    _connectState.value = _connectState.value?.copy(
                        busyPlatform = null,
                        lastError = exchangeResult.error ?: "Could not complete the connection."
                    )
                }
            }.onFailure { e ->
                _connectState.value = _connectState.value?.copy(
                    busyPlatform = null,
                    lastError = e.message ?: "Could not complete the connection."
                )
            }
        }
    }
}
