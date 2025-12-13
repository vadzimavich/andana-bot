const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 800;
const height = 600;
const chartCallback = (ChartJS) => {
  ChartJS.defaults.responsive = true;
  ChartJS.defaults.maintainAspectRatio = false;
  ChartJS.defaults.font.size = 20;
  ChartJS.defaults.color = 'black';
};

const chartNode = new ChartJSNodeCanvas({ width, height, chartCallback });

// Гистограмма (Дни месяца)
async function generateBarChart(labels, data, label) {
  const configuration = {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
      }]
    },
    options: {
      scales: { y: { beginAtZero: true } }
    }
  };
  return await chartNode.renderToBuffer(configuration);
}

// Круговая (Категории)
async function generatePieChart(labels, data, title) {
  const configuration = {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
        ],
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 24 } },
        legend: { position: 'bottom' }
      }
    }
  };
  return await chartNode.renderToBuffer(configuration);
}

// Линейный (Вес)
async function generateLineChart(labels, data, label) {
  const configuration = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        spanGaps: true
      }]
    }
  };
  return await chartNode.renderToBuffer(configuration);
}

// Горизонтальный бар (Привычки)
async function generateHabitChart(labels, data, label) {
  const configuration = {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        backgroundColor: 'rgba(75, 192, 192, 0.8)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y', // Горизонтальный
      scales: {
        x: { beginAtZero: true, max: 7 } // Максимум 7 дней
      }
    }
  };
  return await chartNode.renderToBuffer(configuration);
}

module.exports = { generateBarChart, generatePieChart, generateLineChart, generateHabitChart };