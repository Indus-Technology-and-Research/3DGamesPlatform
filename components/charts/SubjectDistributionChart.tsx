'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface SubjectData {
  name: string
  value: number // time spent in hours
  color: string
  [key: string]: string | number // Index signature for Recharts compatibility
}

interface SubjectDistributionChartProps {
  data: SubjectData[]
}

export default function SubjectDistributionChart({ data }: SubjectDistributionChartProps) {
  const totalHours = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="w-full h-80 relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={5}
            dataKey="value"
            label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
            labelLine={{ stroke: '#9CA3AF' }}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#F3F4F6'
            }}
            formatter={(value: number) => [`${value.toFixed(1)} hours`, 'Time Spent']}
          />
          <Legend
            wrapperStyle={{ fontSize: '14px', color: '#D1D5DB' }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
        <p className="text-3xl font-bold text-white">{totalHours.toFixed(1)}</p>
        <p className="text-sm text-gray-400">Total Hours</p>
      </div>
    </div>
  )
}
