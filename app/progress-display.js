import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function ProgressDisplay({ isProcessing, progressSteps }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (isProcessing) {
      const timer = setInterval(() => {
        setProgress((oldProgress) => {
          const newProgress = Math.min(oldProgress + 1, 100)
          if (newProgress === 100) {
            clearInterval(timer)
          }
          return newProgress
        })
      }, 500)

      return () => {
        clearInterval(timer)
      }
    } else {
      setProgress(0)
    }
  }, [isProcessing])

  if (!isProcessing && (!progressSteps || progressSteps.length === 0)) {
    return null
  }

  return (
    <Card className="w-full mt-6">
      <CardHeader>
        <CardTitle className="flex items-center">
          {isProcessing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
          )}
          Generation Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={progress} className="mb-4" />
        <div className="space-y-4">
          {progressSteps && progressSteps.map((step, index) => (
            <div key={index} className="flex items-start">
              {step.status === 'pending' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {step.status === 'complete' && <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />}
              {step.status === 'error' && <AlertCircle className="w-4 h-4 mr-2 text-red-500" />}
              <div className="flex-1">
                <p className="text-sm font-medium">{step.message}</p>
                {step.details && (
                  <p className="text-xs text-gray-500">
                    {step.details.wordCount && `${step.details.wordCount} words`}
                    {step.details.wordCount && step.details.cost && ', '}
                    {step.details.cost && `cost: $${step.details.cost.toFixed(4)}`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}