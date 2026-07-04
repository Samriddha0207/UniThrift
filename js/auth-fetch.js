
window.authFetch = async function authFetch(url, options = {}) {
    const token        = localStorage.getItem('unithrift_session_token')  || '';
    const refreshToken = localStorage.getItem('unithrift_refresh_token')  || '';

    const headers = {
        ...(options.headers || {}),
        'Authorization':   `Bearer ${token}`,
        'X-Refresh-Token': refreshToken
    };

    const response = await fetch(url, { ...options, headers });

    // If server silently refreshed the tokens, persist them now
    const newAccess  = response.headers.get('X-New-Access-Token');
    const newRefresh = response.headers.get('X-New-Refresh-Token');
    if (newAccess) {
        localStorage.setItem('unithrift_session_token',  newAccess);
        console.log('🔄 Access token silently refreshed.');
    }
    if (newRefresh) {
        localStorage.setItem('unithrift_refresh_token', newRefresh);
    }

    // Hard 401 means refresh token is also dead → force re-login
    if (response.status === 401) {
        localStorage.removeItem('unithrift_session_token');
        localStorage.removeItem('unithrift_refresh_token');
        setTimeout(() => { window.location.href = '/'; }, 100);
    }

    return response;
};

