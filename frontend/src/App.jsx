import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import OverviewView from './components/OverviewView';
import OpeningRvolView from './components/OpeningRvolView';
import ScreenerView from './components/ScreenerView';
import SectorView from './components/SectorView';
import StockChartModal from './components/StockChartModal';
import FyersAuthModal from './components/FyersAuthModal';

import { checkHealth, getIndices } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [indices, setIndices] = useState([]);
  const [fyersConnected, setFyersConnected] = useState(false);
  
  const [selectedStock, setSelectedStock] = useState(null); // { symbol, name }
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Auto Refresh State (seconds: 10, 30, 60, 300, 0 = off)
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchGlobalData = async () => {
    setIsRefreshing(true);
    try {
      const health = await checkHealth();
      setFyersConnected(health.fyers_connected || false);

      const idxData = await getIndices();
      setIndices(idxData);

      // Trigger view data refresh
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      console.error('Error fetching global data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchGlobalData();
  }, []);

  // Poll health status quietly without auto-triggering view refresh
  useEffect(() => {
    const healthPoller = setInterval(async () => {
      const health = await checkHealth();
      if (health.fyers_connected !== fyersConnected) {
        setFyersConnected(health.fyers_connected || false);
      }
    }, 5000);

    return () => clearInterval(healthPoller);
  }, [fyersConnected]);

  // Auto-refresh countdown timer effect
  useEffect(() => {
    if (refreshInterval <= 0) return;

    setCountdown(refreshInterval);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchGlobalData();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [refreshInterval]);

  const handleSelectStock = (symbol, name) => {
    setSelectedStock({ symbol, name });
  };

  const handleManualRefresh = () => {
    setCountdown(refreshInterval);
    fetchGlobalData();
  };

  return (
    <div className="app-container">
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        indices={indices}
        fyersConnected={fyersConnected}
        onOpenAuthModal={() => setShowAuthModal(true)}
        refreshInterval={refreshInterval}
        setRefreshInterval={setRefreshInterval}
        countdown={countdown}
        isRefreshing={isRefreshing}
        onManualRefresh={handleManualRefresh}
      />

      <main className="main-content">
        {activeTab === 'overview' && (
          <OverviewView 
            onSelectStock={handleSelectStock}
            onSwitchToScreener={() => setActiveTab('screener')}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeTab === 'rvol' && (
          <OpeningRvolView 
            onSelectStock={handleSelectStock}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeTab === 'screener' && (
          <ScreenerView 
            onSelectStock={handleSelectStock}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeTab === 'sectors' && (
          <SectorView 
            onSelectStock={handleSelectStock}
            refreshTrigger={refreshTrigger}
          />
        )}
      </main>

      {/* Stock Chart Drawer / Modal */}
      {selectedStock && (
        <StockChartModal 
          symbol={selectedStock.symbol}
          name={selectedStock.name}
          onClose={() => setSelectedStock(null)}
        />
      )}

      {/* FYERS Auth Credentials Modal */}
      {showAuthModal && (
        <FyersAuthModal 
          onClose={() => setShowAuthModal(false)}
          onConnected={(status) => setFyersConnected(status)}
        />
      )}
    </div>
  );
}
