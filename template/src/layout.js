import Header from './components/Header.html?raw';
import ProductionMetrics from './components/ProductionMetrics.html?raw';
import PlantOverview from './components/PlantOverview.html?raw';
import StatusDistribution from './components/StatusDistribution.html?raw';
import AlarmTable from './components/AlarmTable.html?raw';
import ScenePanel from './components/ScenePanel.html?raw';
import TrendPanels from './components/TrendPanels.html?raw';
import DeviceDetail from './components/DeviceDetail.html?raw';
import DeviceData from './components/DeviceData.html?raw';
import WaterQuality from './components/WaterQuality.html?raw';
import Footer from './components/Footer.html?raw';
import Overlays from './components/Overlays.html?raw';

export function mountLayout(container = document.body) {
  container.innerHTML = `<div id="viewport">
  <div id="dashboard" class="dashboard">
    ${Header}
    <main class="workspace">
      <aside class="left-column">
        ${ProductionMetrics}
        ${PlantOverview}
        ${StatusDistribution}
        ${AlarmTable}
      </aside>
      <div class="center-column">
        ${ScenePanel}
        ${TrendPanels}
      </div>
      <aside class="right-column">
        ${DeviceDetail}
        ${DeviceData}
        ${WaterQuality}
      </aside>
    </main>
    ${Footer}
    ${Overlays}
  </div>
</div>`;
  return container.querySelector('#dashboard');
}
