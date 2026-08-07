clear;
clc;

readChannelID = 3446548;
readAPIKey = '5OX6UHRP93RQ1MTV';   % Replace with your Read API Key

[data,time] = thingSpeakRead(readChannelID,...
    'Fields',1,...
    'NumPoints',100,...
    'ReadKey',readAPIKey);

% Remove missing and invalid values (zeros are invalid BPM readings)
idx = ~isnan(data) & data > 0;
data = data(idx);
time = time(idx);

if isempty(data)
    disp('No data received from ThingSpeak');
    return;
end

% Only ONE figure is allowed
figure(1); clf;

%% 1. Heart Rate Trend
subplot(2,2,1)
plot(time,data,'r','LineWidth',2)
grid on
hold on
yline(60,'b--','60 BPM')
yline(100,'g--','100 BPM')
xlabel('Time')
ylabel('BPM')
title('Heart Rate')

%% 2. Histogram
subplot(2,2,2)
histogram(data,15)
grid on
xlabel('BPM')
ylabel('Count')
title('Distribution')

%% 3. Scatter Plot
subplot(2,2,3)
scatter(time,data,35,data,'filled')
grid on
xlabel('Time')
ylabel('BPM')
title('Scatter Plot')
colorbar

%% 4. Current BPM
subplot(2,2,4)

latestBPM = data(end);

bar(latestBPM)

ylim([40 140])

grid on

ylabel('BPM')
title('Current Reading')

if latestBPM < 60
    text(1,latestBPM+3,'Bradycardia','HorizontalAlignment','center')
elseif latestBPM <= 100
    text(1,latestBPM+3,'Normal','HorizontalAlignment','center')
else
    text(1,latestBPM+3,'Tachycardia','HorizontalAlignment','center')
end
