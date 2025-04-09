// src/app/components/StockChart.tsx
import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface StockChartProps {
    data: {
        labels: string[];
        values: number[];
    };
}

const StockChart: React.FC<StockChartProps> = ({ data }) => {
    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'Stock Quantity',
                data: data.values,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top' as const,
            },
            title: {
                display: true,
                text: 'Stock Quantity Overview',
            },
        },
        animation: {
            duration: 1000, // Animation duration
            easing: 'easeOutBounce', // Animation easing
        },
    };

    return <Bar data={chartData} options={options} />;
};

export default StockChart;